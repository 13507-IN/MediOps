import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import Inventory from '../models/Inventory.js';
import Resource from '../models/Resource.js';
import { emitToUser } from '../utils/sseManager.js';

const router = express.Router();

/**
 * GET /api/inventory
 * Get current inventory for the authenticated user's hospital
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    let inventory = await Inventory.findOne({
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
    });

    if (!inventory) {
      inventory = await syncInventoryFromResources(req.user.id, req.user.hospitalId);
    }

    const lowStock = inventory.checkLowStock();

    res.json({
      success: true,
      data: {
        inventory,
        lowStockAlerts: lowStock,
      },
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching inventory',
    });
  }
});

/**
 * POST /api/inventory/sync
 * Sync inventory from uploaded resource documents
 */
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const inventory = await syncInventoryFromResources(req.user.id, req.user.hospitalId);

    const lowStock = inventory.checkLowStock();

    res.json({
      success: true,
      message: 'Inventory synced from resource documents',
      data: {
        inventory,
        lowStockAlerts: lowStock,
      },
    });
  } catch (error) {
    console.error('Sync inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing inventory',
    });
  }
});

/**
 * POST /api/inventory/restock
 * Manually restock an item
 */
router.post('/restock', requireAuth, async (req, res) => {
  try {
    const { category, item, quantity, notes } = req.body;

    if (!category || !item || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'category, item, and quantity (>0) are required',
      });
    }

    let inventory = await Inventory.findOne({
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
    });

    if (!inventory) {
      return res.status(404).json({
        success: false,
        message: 'Inventory not found. Upload resource documents first.',
      });
    }

    const fieldMap = {
      'beds': ['general_beds', 'icu_beds', 'isolation_beds'],
      'equipment': ['oxygen_cylinders', 'dialysis_machines', 'ecg_machines', 'ct_scan', 'endoscopy', 'bp_machines', 'ultrasonography', 'xray_machines'],
      'rooms': ['ot_rooms'],
      'supplies': ['saline', 'injections', 'antibodies'],
      'staff': ['available_nurses_count'],
    };

    const validItems = Object.values(fieldMap).flat();
    if (!validItems.includes(item)) {
      return res.status(400).json({
        success: false,
        message: `Invalid item. Valid items: ${validItems.join(', ')}`,
      });
    }

    const previousQty = getInventoryValue(inventory, item) || 0;
    addInventoryValue(inventory, item, quantity);

    inventory.transactionLog.push({
      type: 'restock',
      itemName: item,
      category,
      quantityChange: quantity,
      previousQuantity: previousQty,
      newQuantity: previousQty + quantity,
      notes,
    });

    inventory.lastUpdatedBy = req.user.email;
    await inventory.save();

    const lowStock = inventory.checkLowStock();

    res.json({
      success: true,
      message: `Restocked ${item} with ${quantity} units`,
      data: {
        inventory,
        lowStockAlerts: lowStock,
      },
    });
  } catch (error) {
    console.error('Restock error:', error);
    res.status(500).json({
      success: false,
      message: 'Error restocking item',
    });
  }
});

/**
 * POST /api/inventory/adjust
 * Manually adjust an item's quantity (can be negative)
 */
router.post('/adjust', requireAuth, async (req, res) => {
  try {
    const { category, item, quantity, notes } = req.body;

    if (!category || !item || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'category, item, and quantity are required',
      });
    }

    let inventory = await Inventory.findOne({
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
    });

    if (!inventory) {
      return res.status(404).json({
        success: false,
        message: 'Inventory not found.',
      });
    }

    const previousQty = getInventoryValue(inventory, item) || 0;
    const newQty = previousQty + quantity;

    if (newQty < 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot reduce ${item} below 0. Current: ${previousQty}, Requested change: ${quantity}`,
      });
    }

    setInventoryValue(inventory, item, newQty);

    inventory.transactionLog.push({
      type: 'adjustment',
      itemName: item,
      category,
      quantityChange: quantity,
      previousQuantity: previousQty,
      newQuantity: newQty,
      notes,
    });

    inventory.lastUpdatedBy = req.user.email;
    await inventory.save();

    const lowStock = inventory.checkLowStock();

    res.json({
      success: true,
      message: `Adjusted ${item} by ${quantity > 0 ? '+' : ''}${quantity}`,
      data: {
        inventory,
        lowStockAlerts: lowStock,
      },
    });
  } catch (error) {
    console.error('Adjust inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adjusting inventory',
    });
  }
});

/**
 * GET /api/inventory/log
 * Get transaction log
 */
router.get('/log', requireAuth, async (req, res) => {
  try {
    const { limit = 50, page = 1, type } = req.query;

    const inventory = await Inventory.findOne({
      userId: req.user.id,
      hospitalId: req.user.hospitalId,
    });

    if (!inventory) {
      return res.json({
        success: true,
        data: { transactions: [], pagination: { total: 0, page: 1, limit: parseInt(limit), pages: 0 } },
      });
    }

    let transactions = inventory.transactionLog;
    if (type) {
      transactions = transactions.filter(t => t.type === type);
    }

    const total = transactions.length;
    const paginated = transactions
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice((parseInt(page) - 1) * parseInt(limit), parseInt(page) * parseInt(limit));

    res.json({
      success: true,
      data: {
        transactions: paginated,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get transaction log error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transaction log',
    });
  }
});

async function syncInventoryFromResources(userId, hospitalId) {
  const resources = await Resource.find({
    userId,
    hospitalId,
    processingStatus: 'completed',
  }).sort({ createdAt: -1 });

  let inventory = await Inventory.findOne({ userId, hospitalId });

  if (!inventory) {
    inventory = new Inventory({
      userId,
      hospitalId,
      beds: { general: 0, icu: 0, isolation: 0 },
      equipment: {
        oxygenCylinders: 0,
        dialysisMachines: 0,
        ecgMachines: 0,
        ctScan: 0,
        endoscopy: 0,
        bpMachines: 0,
        ultrasonography: 0,
        xrayMachines: 0,
      },
      rooms: { ot: 0 },
      supplies: { saline: 0, injections: 0, antibodies: 0 },
      staff: { availableNurses: 0 },
    });
  }

  if (resources.length > 0) {
    const latestResource = resources[0];
    inventory.hospitalName = latestResource.resourceData?.hospitalName || inventory.hospitalName;
    inventory.city = latestResource.resourceData?.city || inventory.city;
    inventory.lastSyncedFromResource = latestResource._id;

    inventory.transactionLog.push({
      type: 'import',
      itemName: 'all',
      category: 'sync',
      quantityChange: 0,
      notes: `Synced from ${resources.length} resource document(s)`,
    });
  }

  await inventory.save();
  return inventory;
}

function getInventoryValue(inventory, item) {
  const map = {
    'general_beds': () => inventory.beds.general,
    'icu_beds': () => inventory.beds.icu,
    'isolation_beds': () => inventory.beds.isolation,
    'oxygen_cylinders': () => inventory.equipment.oxygenCylinders,
    'dialysis_machines': () => inventory.equipment.dialysisMachines,
    'ecg_machines': () => inventory.equipment.ecgMachines,
    'ct_scan': () => inventory.equipment.ctScan,
    'endoscopy': () => inventory.equipment.endoscopy,
    'bp_machines': () => inventory.equipment.bpMachines,
    'ultrasonography': () => inventory.equipment.ultrasonography,
    'xray_machines': () => inventory.equipment.xrayMachines,
    'ot_rooms': () => inventory.rooms.ot,
    'saline': () => inventory.supplies.saline,
    'injections': () => inventory.supplies.injections,
    'antibodies': () => inventory.supplies.antibodies,
    'available_nurses_count': () => inventory.staff.availableNurses,
  };
  return map[item]?.() ?? 0;
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

function setInventoryValue(inventory, item, value) {
  const map = {
    'general_beds': () => { inventory.beds.general = value; },
    'icu_beds': () => { inventory.beds.icu = value; },
    'isolation_beds': () => { inventory.beds.isolation = value; },
    'oxygen_cylinders': () => { inventory.equipment.oxygenCylinders = value; },
    'dialysis_machines': () => { inventory.equipment.dialysisMachines = value; },
    'ecg_machines': () => { inventory.equipment.ecgMachines = value; },
    'ct_scan': () => { inventory.equipment.ctScan = value; },
    'endoscopy': () => { inventory.equipment.endoscopy = value; },
    'bp_machines': () => { inventory.equipment.bpMachines = value; },
    'ultrasonography': () => { inventory.equipment.ultrasonography = value; },
    'xray_machines': () => { inventory.equipment.xrayMachines = value; },
    'ot_rooms': () => { inventory.rooms.ot = value; },
    'saline': () => { inventory.supplies.saline = value; },
    'injections': () => { inventory.supplies.injections = value; },
    'antibodies': () => { inventory.supplies.antibodies = value; },
    'available_nurses_count': () => { inventory.staff.availableNurses = value; },
  };
  map[item]?.();
}

export default router;
