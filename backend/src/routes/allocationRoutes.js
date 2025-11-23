import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import Allocation from '../models/Allocation.js';
import Document from '../models/Document.js';
import Resource from '../models/Resource.js';

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

    // Validate document exists
    const document = await Document.findOne({
      _id: documentId,
      userId: req.user.id,
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    // Get current available resources (most recent) - fetch fresh to avoid race conditions
    let latestResource = await Resource.findOne({
      userId: req.user.id,
      processingStatus: 'completed',
    }).sort({ createdAt: -1 });

    if (!latestResource) {
      return res.status(400).json({
        success: false,
        message: 'No resources available for allocation',
      });
    }

    let resourceSnapshot = { ...latestResource.resourceData?.inventory } || {};

    // Validate sufficient resources are available
    const errors = [];
    
    if (allocatedResources.beds?.quantity) {
      const bedType = allocatedResources.beds.bedType.toLowerCase();
      const fieldName = bedType === 'icu' ? 'icu_beds' : bedType === 'isolation' ? 'isolation_beds' : 'general_beds';
      const availableBeds = resourceSnapshot[fieldName] || 0;
      
      if (availableBeds < allocatedResources.beds.quantity) {
        errors.push(`Insufficient ${bedType} beds. Available: ${availableBeds}, Requested: ${allocatedResources.beds.quantity}`);
      }
    }

    if (allocatedResources.oxygenCylinders?.quantity) {
      const availableOxygen = resourceSnapshot.other_equipment?.find(e => 
        e.name?.toLowerCase().includes('oxygen')
      )?.count || 0;
      
      if (availableOxygen < allocatedResources.oxygenCylinders.quantity) {
        errors.push(`Insufficient oxygen cylinders. Available: ${availableOxygen}, Requested: ${allocatedResources.oxygenCylinders.quantity}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient resources for allocation',
        errors,
      });
    }

    // Create allocation
    const allocation = new Allocation({
      userId: req.user.id,
      userEmail: req.user.email,
      documentId,
      patientInfo,
      prescriptionDetails,
      allocatedResources,
      resourceSnapshot,
      status: 'allocated',
    });

    await allocation.save();

    // Deduct from resources - create updated inventory with proper deep copy
    const updatedInventory = {
      ...latestResource.resourceData.inventory,
      medicines: latestResource.resourceData.inventory.medicines ? [...latestResource.resourceData.inventory.medicines] : [],
      other_equipment: latestResource.resourceData.inventory.other_equipment ? [...latestResource.resourceData.inventory.other_equipment] : [],
      instruments: latestResource.resourceData.inventory.instruments ? [...latestResource.resourceData.inventory.instruments] : [],
    };

    if (allocatedResources.beds?.quantity) {
      const bedType = allocatedResources.beds.bedType.toLowerCase();
      const fieldName = bedType === 'icu' ? 'icu_beds' : bedType === 'isolation' ? 'isolation_beds' : 'general_beds';
      updatedInventory[fieldName] = (updatedInventory[fieldName] || 0) - allocatedResources.beds.quantity;
    }

    if (allocatedResources.oxygenCylinders?.quantity) {
      if (updatedInventory.other_equipment && Array.isArray(updatedInventory.other_equipment)) {
        const oxygenIdx = updatedInventory.other_equipment.findIndex(e => 
          e.name?.toLowerCase().includes('oxygen')
        );
        if (oxygenIdx >= 0) {
          updatedInventory.other_equipment[oxygenIdx] = {
            ...updatedInventory.other_equipment[oxygenIdx],
            count: updatedInventory.other_equipment[oxygenIdx].count - allocatedResources.oxygenCylinders.quantity,
          };
        }
      }
    }

    // Update the resource record with fresh fetch and update
    latestResource = await Resource.findByIdAndUpdate(
      latestResource._id,
      {
        'resourceData.inventory': updatedInventory,
      },
      { new: true }
    );

    // Check for low stock items
    const lowStockItems = [];

    if (allocatedResources.beds?.quantity) {
      const bedType = allocatedResources.beds.bedType.toLowerCase();
      const fieldName = bedType === 'icu' ? 'icu_beds' : bedType === 'isolation' ? 'isolation_beds' : 'general_beds';
      const remainingBeds = updatedInventory[fieldName] || 0;
      if (remainingBeds < 5) {
        lowStockItems.push({
          item: `${allocatedResources.beds.bedType} Beds`,
          remaining: remainingBeds,
          alert: 'CRITICAL',
        });
      }
    }

    if (allocatedResources.oxygenCylinders?.quantity) {
      const oxygenEquip = updatedInventory.other_equipment?.find(e => 
        e.name?.toLowerCase().includes('oxygen')
      );
      if (oxygenEquip && oxygenEquip.count < 5) {
        lowStockItems.push({
          item: 'Oxygen Cylinders',
          remaining: oxygenEquip.count,
          alert: 'CRITICAL',
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Allocation created successfully',
      data: {
        allocationId: allocation._id,
        allocation,
        lowStockAlerts: lowStockItems,
      },
    });
  } catch (error) {
    console.error('Create allocation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating allocation',
    });
  }
});

/**
 * GET /api/allocations
 * Get all allocations for the authenticated user
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { limit = 20, page = 1, status } = req.query;

    let query = { userId: req.user.id };
    if (status) {
      query.status = status;
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

/**
 * GET /api/allocations/:id
 * Get a specific allocation
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const allocation = await Allocation.findOne({
      _id: req.params.id,
      userId: req.user.id,
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

/**
 * PUT /api/allocations/:id
 * Update an allocation status
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;

    const allocation = await Allocation.findOne({
      _id: req.params.id,
      userId: req.user.id,
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

/**
 * DELETE /api/allocations/:id
 * Delete/deallocate resources
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const allocation = await Allocation.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!allocation) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found',
      });
    }

    // Get the latest resource to add back the allocated items - fetch fresh
    let latestResource = await Resource.findOne({
      userId: req.user.id,
      processingStatus: 'completed',
    }).sort({ createdAt: -1 });

    if (latestResource) {
      const updatedInventory = {
        ...latestResource.resourceData.inventory,
        medicines: latestResource.resourceData.inventory.medicines ? [...latestResource.resourceData.inventory.medicines] : [],
        other_equipment: latestResource.resourceData.inventory.other_equipment ? [...latestResource.resourceData.inventory.other_equipment] : [],
        instruments: latestResource.resourceData.inventory.instruments ? [...latestResource.resourceData.inventory.instruments] : [],
      };

      // Add back allocated beds
      if (allocation.allocatedResources?.beds?.quantity) {
        const bedType = allocation.allocatedResources.beds.bedType.toLowerCase();
        const fieldName = bedType === 'icu' ? 'icu_beds' : bedType === 'isolation' ? 'isolation_beds' : 'general_beds';
        updatedInventory[fieldName] = (updatedInventory[fieldName] || 0) + allocation.allocatedResources.beds.quantity;
      }

      // Add back oxygen cylinders
      if (allocation.allocatedResources?.oxygenCylinders?.quantity) {
        if (updatedInventory.other_equipment && Array.isArray(updatedInventory.other_equipment)) {
          const oxygenIdx = updatedInventory.other_equipment.findIndex(e => 
            e.name?.toLowerCase().includes('oxygen')
          );
          if (oxygenIdx >= 0) {
            updatedInventory.other_equipment[oxygenIdx] = {
              ...updatedInventory.other_equipment[oxygenIdx],
              count: updatedInventory.other_equipment[oxygenIdx].count + allocation.allocatedResources.oxygenCylinders.quantity,
            };
          }
        }
      }

      // Update the resource record with fresh data
      latestResource = await Resource.findByIdAndUpdate(
        latestResource._id,
        {
          'resourceData.inventory': updatedInventory,
        },
        { new: true }
      );
    }

    allocation.status = 'deallocated';
    await allocation.save();

    res.json({
      success: true,
      message: 'Resources deallocated successfully and returned to inventory',
      data: allocation,
    });
  } catch (error) {
    console.error('Delete allocation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deallocating resources',
    });
  }
});

/**
 * POST /api/allocations/check-stock
 * Check current stock levels
 */
router.post('/check-stock', requireAuth, async (req, res) => {
  try {
    const resourceData = await Resource.find({
      userId: req.user.id,
      processingStatus: 'completed',
    });

    if (resourceData.length === 0) {
      return res.json({
        success: true,
        data: {
          lowStockItems: [],
          inventory: {},
        },
      });
    }

    const inventory = resourceData[0].resourceData?.inventory || {};
    const lowStockItems = [];

    // Check for items below 5
    if (inventory.general_beds && inventory.general_beds < 5) {
      lowStockItems.push({
        item: 'General Beds',
        count: inventory.general_beds,
        threshold: 5,
      });
    }
    if (inventory.ot_rooms && inventory.ot_rooms < 5) {
      lowStockItems.push({
        item: 'OT Rooms',
        count: inventory.ot_rooms,
        threshold: 5,
      });
    }
    if (inventory.saline && inventory.saline < 5) {
      lowStockItems.push({
        item: 'Saline',
        count: inventory.saline,
        threshold: 5,
      });
    }
    if (inventory.injections && inventory.injections < 5) {
      lowStockItems.push({
        item: 'Injections',
        count: inventory.injections,
        threshold: 5,
      });
    }
    if (inventory.medicines && Array.isArray(inventory.medicines)) {
      inventory.medicines.forEach((med) => {
        if (med.count < 5) {
          lowStockItems.push({
            item: `Medicine: ${med.name}`,
            count: med.count,
            threshold: 5,
          });
        }
      });
    }
    if (inventory.other_equipment && Array.isArray(inventory.other_equipment)) {
      inventory.other_equipment.forEach((eq) => {
        if (eq.count < 5) {
          lowStockItems.push({
            item: `${eq.name}`,
            count: eq.count,
            threshold: 5,
          });
        }
      });
    }

    res.json({
      success: true,
      data: {
        lowStockItems,
        inventory,
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

export default router;
