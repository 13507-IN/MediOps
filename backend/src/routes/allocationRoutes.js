import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import Allocation from '../models/Allocation.js';
import Document from '../models/Document.js';
import Inventory from '../models/Inventory.js';
import { emitToUser } from '../utils/sseManager.js';

const router = express.Router();

/**
 * POST /api/allocations
 * Create a new allocation with resources
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      documentId,
      patientInfo,
      prescriptionDetails,
      allocatedResources,
      notes,
    } = req.body;

    const document = await Document.findOne({
      _id: documentId,
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    let inventory = await Inventory.findOne({
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
    });

    if (!inventory) {
      return res.status(400).json({
        success: false,
        message: 'No inventory found. Upload resource documents and sync inventory first.',
      });
    }

    const errors = [];
    const deductions = [];

    if (allocatedResources.beds?.quantity && allocatedResources.beds.quantity > 0) {
      const bedType = allocatedResources.beds.bedType.toLowerCase();
      const fieldName = bedType === 'icu' ? 'icu_beds' : bedType === 'isolation' ? 'isolation_beds' : 'general_beds';
      const current = getInventoryValue(inventory, fieldName);

      if (current < allocatedResources.beds.quantity) {
        errors.push(`Insufficient ${bedType} beds. Available: ${current}, Requested: ${allocatedResources.beds.quantity}`);
      } else {
        deductions.push({ category: 'beds', item: fieldName, quantity: allocatedResources.beds.quantity });
      }
    }

    if (allocatedResources.oxygenCylinders?.quantity && allocatedResources.oxygenCylinders.quantity > 0) {
      const current = inventory.equipment.oxygenCylinders || 0;
      if (current < allocatedResources.oxygenCylinders.quantity) {
        errors.push(`Insufficient oxygen cylinders. Available: ${current}, Requested: ${allocatedResources.oxygenCylinders.quantity}`);
      } else {
        deductions.push({ category: 'equipment', item: 'oxygen_cylinders', quantity: allocatedResources.oxygenCylinders.quantity });
      }
    }

    if (allocatedResources.dialysis?.sessions && allocatedResources.dialysis.sessions > 0) {
      const current = inventory.equipment.dialysisMachines || 0;
      if (current < allocatedResources.dialysis.sessions) {
        errors.push(`Insufficient dialysis machines. Available: ${current}, Requested: ${allocatedResources.dialysis.sessions}`);
      } else {
        deductions.push({ category: 'equipment', item: 'dialysis_machines', quantity: allocatedResources.dialysis.sessions });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient resources for allocation',
        errors,
      });
    }

    const resourceSnapshot = getInventorySnapshot(inventory);

    const allocation = new Allocation({
      userId: req.user.id,
      userEmail: req.user.email,
      hospitalId: req.user.hospitalId,
      documentId,
      patientInfo,
      prescriptionDetails,
      allocatedResources,
      resourceSnapshot,
      status: 'allocated',
      lifecycle: {
        admittedAt: new Date(),
        status: 'admitted',
      },
    });

    await allocation.save();

    for (const deduction of deductions) {
      deductInventoryValue(inventory, deduction.item, deduction.quantity);
      inventory.transactionLog.push({
        type: 'allocation',
        itemName: deduction.item,
        category: deduction.category,
        quantityChange: -deduction.quantity,
        previousQuantity: getInventoryValue(inventory, deduction.item) + deduction.quantity,
        newQuantity: getInventoryValue(inventory, deduction.item),
        referenceId: allocation._id,
      });
    }

    inventory.lastUpdatedBy = req.user.email;
    await inventory.save();

    const lowStockAlerts = inventory.checkLowStock();

    res.status(201).json({
      success: true,
      message: 'Allocation created successfully',
      data: {
        allocationId: allocation._id,
        allocation,
        lowStockAlerts,
      },
    });

    emitToUser(req.user.id, 'allocation:created', {
      allocation,
      lowStockAlerts,
      message: `Resources allocated to ${patientInfo?.name || 'patient'}`,
    });

    if (lowStockAlerts.length > 0) {
      emitToUser(req.user.id, 'alert:low-stock', {
        items: lowStockAlerts,
        message: `Low stock: ${lowStockAlerts.map(i => i.item).join(', ')}`,
      });
    }
  } catch (error) {
    console.error('Create allocation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating allocation',
    });
  }
});

/**
 * PUT /api/allocations/:id/lifecycle
 * Transition patient lifecycle status
 */
router.put('/:id/lifecycle', requireAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;

    const validTransitions = {
      admitted: ['treated', 'discharged'],
      treated: ['discharged'],
      discharged: [],
    };

    if (!status || !validTransitions[status]) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${Object.keys(validTransitions).join(', ')}`,
      });
    }

    const allocation = await Allocation.findOne({
      _id: req.params.id,
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
    });

    if (!allocation) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found',
      });
    }

    const currentStatus = allocation.lifecycle?.status || 'allocated';
    const allowedNext = validTransitions[currentStatus] || [];

    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from "${currentStatus}" to "${status}". Allowed: ${allowedNext.join(', ') || 'none'}`,
      });
    }

    const previousStatus = allocation.lifecycle?.status;
    allocation.lifecycle = {
      ...allocation.lifecycle,
      status,
      notes: notes || allocation.lifecycle?.notes,
    };

    if (status === 'treated' && !allocation.lifecycle.treatedAt) {
      allocation.lifecycle.treatedAt = new Date();
    }

    if (status === 'discharged') {
      allocation.lifecycle.dischargedAt = new Date();
      allocation.status = 'completed';

      let inventory = await Inventory.findOne({
        userId: req.user.id,
        hospitalId: req.user.hospitalId,
      });

      if (inventory) {
        const allocResources = allocation.allocatedResources;

        if (allocResources.beds?.quantity && allocResources.beds.quantity > 0) {
          const bedType = allocResources.beds.bedType.toLowerCase();
          const fieldName = bedType === 'icu' ? 'icu_beds' : bedType === 'isolation' ? 'isolation_beds' : 'general_beds';
          addInventoryValue(inventory, fieldName, allocResources.beds.quantity);
          inventory.transactionLog.push({
            type: 'deallocation',
            itemName: fieldName,
            category: 'beds',
            quantityChange: allocResources.beds.quantity,
            previousQuantity: getInventoryValue(inventory, fieldName) - allocResources.beds.quantity,
            newQuantity: getInventoryValue(inventory, fieldName),
            referenceId: allocation._id,
            notes: `Auto-released on discharge (patient: ${allocation.patientInfo?.name || 'unknown'})`,
          });
        }

        if (allocResources.oxygenCylinders?.quantity) {
          addInventoryValue(inventory, 'oxygen_cylinders', allocResources.oxygenCylinders.quantity);
          inventory.transactionLog.push({
            type: 'deallocation',
            itemName: 'oxygen_cylinders',
            category: 'equipment',
            quantityChange: allocResources.oxygenCylinders.quantity,
            previousQuantity: inventory.equipment.oxygenCylinders - allocResources.oxygenCylinders.quantity,
            newQuantity: inventory.equipment.oxygenCylinders,
            referenceId: allocation._id,
            notes: 'Auto-released on discharge',
          });
        }

        if (allocResources.dialysis?.sessions) {
          addInventoryValue(inventory, 'dialysis_machines', allocResources.dialysis.sessions);
          inventory.transactionLog.push({
            type: 'deallocation',
            itemName: 'dialysis_machines',
            category: 'equipment',
            quantityChange: allocResources.dialysis.sessions,
            previousQuantity: inventory.equipment.dialysisMachines - allocResources.dialysis.sessions,
            newQuantity: inventory.equipment.dialysisMachines,
            referenceId: allocation._id,
            notes: 'Auto-released on discharge',
          });
        }

        inventory.lastUpdatedBy = req.user.email;
        await inventory.save();
      }
    }

    await allocation.save();

    emitToUser(req.user.id, 'allocation:lifecycle-change', {
      allocationId: allocation._id,
      patientName: allocation.patientInfo?.name,
      previousStatus,
      newStatus: status,
      message: `Patient ${allocation.patientInfo?.name || 'unknown'} status: ${previousStatus} → ${status}`,
    });

    res.json({
      success: true,
      message: `Patient status updated to "${status}"`,
      data: allocation,
    });
  } catch (error) {
    console.error('Lifecycle transition error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating patient status',
    });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const { limit = 20, page = 1, status, lifecycleStatus } = req.query;

    let query = {
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
    };
    if (status) {
      query.status = status;
    }
    if (lifecycleStatus) {
      query['lifecycle.status'] = lifecycleStatus;
    }

    const allocations = await Allocation.find(query)
      .populate('documentId', 'fileName extractedData')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Allocation.countDocuments(query);

    res.json({
      success: true,
      data: {
        allocations,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get allocations error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching allocations',
    });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const allocation = await Allocation.findOne({
      _id: req.params.id,
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
    }).populate('documentId');

    if (!allocation) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found',
      });
    }

    res.json({
      success: true,
      data: allocation,
    });
  } catch (error) {
    console.error('Get allocation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching allocation',
    });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;

    const allocation = await Allocation.findOne({
      _id: req.params.id,
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
    });

    if (!allocation) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found',
      });
    }

    if (status) {
      allocation.status = status;
    }
    if (notes) {
      allocation.notes = notes;
    }

    await allocation.save();

    res.json({
      success: true,
      message: 'Allocation updated successfully',
      data: allocation,
    });
  } catch (error) {
    console.error('Update allocation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating allocation',
    });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const allocation = await Allocation.findOne({
      _id: req.params.id,
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
    });

    if (!allocation) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found',
      });
    }

    let inventory = await Inventory.findOne({
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
    });

    if (inventory) {
      const allocResources = allocation.allocatedResources;

      if (allocResources.beds?.quantity && allocResources.beds.quantity > 0) {
        const bedType = allocResources.beds.bedType.toLowerCase();
        const fieldName = bedType === 'icu' ? 'icu_beds' : bedType === 'isolation' ? 'isolation_beds' : 'general_beds';
        addInventoryValue(inventory, fieldName, allocResources.beds.quantity);
        inventory.transactionLog.push({
          type: 'deallocation',
          itemName: fieldName,
          category: 'beds',
          quantityChange: allocResources.beds.quantity,
          previousQuantity: getInventoryValue(inventory, fieldName) - allocResources.beds.quantity,
          newQuantity: getInventoryValue(inventory, fieldName),
          referenceId: allocation._id,
        });
      }

      if (allocResources.oxygenCylinders?.quantity) {
        addInventoryValue(inventory, 'oxygen_cylinders', allocResources.oxygenCylinders.quantity);
        inventory.transactionLog.push({
          type: 'deallocation',
          itemName: 'oxygen_cylinders',
          category: 'equipment',
          quantityChange: allocResources.oxygenCylinders.quantity,
          previousQuantity: inventory.equipment.oxygenCylinders - allocResources.oxygenCylinders.quantity,
          newQuantity: inventory.equipment.oxygenCylinders,
          referenceId: allocation._id,
        });
      }

      if (allocResources.dialysis?.sessions && allocResources.dialysis.sessions > 0) {
        addInventoryValue(inventory, 'dialysis_machines', allocResources.dialysis.sessions);
        inventory.transactionLog.push({
          type: 'deallocation',
          itemName: 'dialysis_machines',
          category: 'equipment',
          quantityChange: allocResources.dialysis.sessions,
          previousQuantity: inventory.equipment.dialysisMachines - allocResources.dialysis.sessions,
          newQuantity: inventory.equipment.dialysisMachines,
          referenceId: allocation._id,
        });
      }

      inventory.lastUpdatedBy = req.user.email;
      await inventory.save();
    }

    allocation.status = 'deallocated';
    await allocation.save();

    res.json({
      success: true,
      message: 'Resources deallocated successfully and returned to inventory',
      data: allocation,
    });

    emitToUser(req.user.id, 'allocation:deallocated', {
      allocation,
      message: `Resources deallocated for ${allocation.patientInfo?.name || 'patient'}`,
    });
  } catch (error) {
    console.error('Delete allocation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deallocating resources',
    });
  }
});

router.post('/check-stock', requireAuth, async (req, res) => {
  try {
    const inventory = await Inventory.findOne({
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
    });

    if (!inventory) {
      return res.json({
        success: true,
        data: {
          lowStockItems: [],
          inventory: null,
        },
      });
    }

    const lowStockItems = inventory.checkLowStock();

    res.json({
      success: true,
      data: {
        lowStockItems,
        inventory: {
          beds: inventory.beds,
          equipment: inventory.equipment,
          rooms: inventory.rooms,
          supplies: inventory.supplies,
          staff: inventory.staff,
        },
        hasLowStock: lowStockItems.length > 0,
      },
    });
  } catch (error) {
    console.error('Check stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking stock',
    });
  }
});

function getInventoryValue(inventory, item) {
  const map = {
    'general_beds': inventory.beds?.general || 0,
    'icu_beds': inventory.beds?.icu || 0,
    'isolation_beds': inventory.beds?.isolation || 0,
    'oxygen_cylinders': inventory.equipment?.oxygenCylinders || 0,
    'dialysis_machines': inventory.equipment?.dialysisMachines || 0,
    'ecg_machines': inventory.equipment?.ecgMachines || 0,
    'ct_scan': inventory.equipment?.ctScan || 0,
    'endoscopy': inventory.equipment?.endoscopy || 0,
    'bp_machines': inventory.equipment?.bpMachines || 0,
    'ultrasonography': inventory.equipment?.ultrasonography || 0,
    'xray_machines': inventory.equipment?.xrayMachines || 0,
    'ot_rooms': inventory.rooms?.ot || 0,
    'saline': inventory.supplies?.saline || 0,
    'injections': inventory.supplies?.injections || 0,
    'antibodies': inventory.supplies?.antibodies || 0,
    'available_nurses_count': inventory.staff?.availableNurses || 0,
  };
  return map[item] ?? 0;
}

function deductInventoryValue(inventory, item, quantity) {
  const map = {
    'general_beds': () => { inventory.beds.general -= quantity; },
    'icu_beds': () => { inventory.beds.icu -= quantity; },
    'isolation_beds': () => { inventory.beds.isolation -= quantity; },
    'oxygen_cylinders': () => { inventory.equipment.oxygenCylinders -= quantity; },
    'dialysis_machines': () => { inventory.equipment.dialysisMachines -= quantity; },
    'ecg_machines': () => { inventory.equipment.ecgMachines -= quantity; },
    'ct_scan': () => { inventory.equipment.ctScan -= quantity; },
    'endoscopy': () => { inventory.equipment.endoscopy -= quantity; },
    'bp_machines': () => { inventory.equipment.bpMachines -= quantity; },
    'ultrasonography': () => { inventory.equipment.ultrasonography -= quantity; },
    'xray_machines': () => { inventory.equipment.xrayMachines -= quantity; },
    'ot_rooms': () => { inventory.rooms.ot -= quantity; },
    'saline': () => { inventory.supplies.saline -= quantity; },
    'injections': () => { inventory.supplies.injections -= quantity; },
    'antibodies': () => { inventory.supplies.antibodies -= quantity; },
    'available_nurses_count': () => { inventory.staff.availableNurses -= quantity; },
  };
  map[item]?.();
}

function addInventoryValue(inventory, item, quantity) {
  const map = {
    'general_beds': () => { inventory.beds.general += quantity; },
    'icu_beds': () => { inventory.beds.icu += quantity; },
    'isolation_beds': () => { inventory.beds.isolation += quantity; },
    'oxygen_cylinders': () => { inventory.equipment.oxygenCylinders += quantity; },
    'dialysis_machines': () => { inventory.equipment.dialysisMachines += quantity; },
    'ecg_machines': () => { inventory.equipment.ecgMachines += quantity; },
    'ct_scan': () => { inventory.equipment.ctScan += quantity; },
    'endoscopy': () => { inventory.equipment.endoscopy += quantity; },
    'bp_machines': () => { inventory.equipment.bpMachines += quantity; },
    'ultrasonography': () => { inventory.equipment.ultrasonography += quantity; },
    'xray_machines': () => { inventory.equipment.xrayMachines += quantity; },
    'ot_rooms': () => { inventory.rooms.ot += quantity; },
    'saline': () => { inventory.supplies.saline += quantity; },
    'injections': () => { inventory.supplies.injections += quantity; },
    'antibodies': () => { inventory.supplies.antibodies += quantity; },
    'available_nurses_count': () => { inventory.staff.availableNurses += quantity; },
  };
  map[item]?.();
}

function getInventorySnapshot(inventory) {
  return {
    beds: { ...inventory.beds },
    equipment: { ...inventory.equipment },
    rooms: { ...inventory.rooms },
    supplies: { ...inventory.supplies },
    staff: { ...inventory.staff },
  };
}

export default router;
