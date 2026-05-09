import mongoose from 'mongoose';

const inventoryItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: {
    type: String,
    enum: ['beds', 'equipment', 'medicine', 'supplies', 'rooms', 'staff', 'other'],
    required: true,
  },
  quantity: { type: Number, required: true, default: 0 },
  unit: { type: String, default: 'units' },
  minThreshold: { type: Number, default: 5 },
  lastRestocked: { type: Date },
  notes: String,
}, { _id: true });

const inventorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    hospitalId: {
      type: String,
      required: true,
      index: true,
    },
    hospitalName: String,
    city: String,
    items: [inventoryItemSchema],
    // Quick-access numeric fields for common items
    beds: {
      general: { type: Number, default: 0 },
      icu: { type: Number, default: 0 },
      isolation: { type: Number, default: 0 },
    },
    equipment: {
      oxygenCylinders: { type: Number, default: 0 },
      dialysisMachines: { type: Number, default: 0 },
      ecgMachines: { type: Number, default: 0 },
      ctScan: { type: Number, default: 0 },
      endoscopy: { type: Number, default: 0 },
      bpMachines: { type: Number, default: 0 },
      ultrasonography: { type: Number, default: 0 },
      xrayMachines: { type: Number, default: 0 },
    },
    rooms: {
      ot: { type: Number, default: 0 },
    },
    supplies: {
      saline: { type: Number, default: 0 },
      injections: { type: Number, default: 0 },
      antibodies: { type: Number, default: 0 },
    },
    staff: {
      availableNurses: { type: Number, default: 0 },
    },
    // Transaction log for audit trail
    transactionLog: [
      {
        type: {
          type: String,
          enum: ['allocation', 'deallocation', 'restock', 'adjustment', 'import'],
          required: true,
        },
        itemName: String,
        category: String,
        quantityChange: { type: Number, required: true },
        previousQuantity: Number,
        newQuantity: Number,
        referenceId: { type: mongoose.Schema.Types.ObjectId },
        notes: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    lastUpdatedBy: String,
    lastSyncedFromResource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource' },
  },
  {
    timestamps: true,
  }
);

inventorySchema.index({ userId: 1, hospitalId: 1 }, { unique: true });
inventorySchema.index({ hospitalId: 1 });

inventorySchema.methods.deduct = async function(category, item, quantity) {
  const fieldMap = {
    'general_beds': ['beds', 'general'],
    'icu_beds': ['beds', 'icu'],
    'isolation_beds': ['beds', 'isolation'],
    'oxygen_cylinders': ['equipment', 'oxygenCylinders'],
    'dialysis_machines': ['equipment', 'dialysisMachines'],
    'ecg_machines': ['equipment', 'ecgMachines'],
    'ct_scan': ['equipment', 'ctScan'],
    'endoscopy': ['equipment', 'endoscopy'],
    'bp_machines': ['equipment', 'bpMachines'],
    'ultrasonography': ['equipment', 'ultrasonography'],
    'xray_machines': ['equipment', 'xrayMachines'],
    'ot_rooms': ['rooms', 'ot'],
    'saline': ['supplies', 'saline'],
    'injections': ['supplies', 'injections'],
    'antibodies': ['supplies', 'antibodies'],
    'available_nurses_count': ['staff', 'availableNurses'],
  };

  const path = fieldMap[item];
  if (!path) return false;

  const current = this[path[0]][path[1]] || 0;
  if (current < quantity) return false;

  this[path[0]][path[1]] = current - quantity;

  this.transactionLog.push({
    type: 'allocation',
    itemName: item,
    category,
    quantityChange: -quantity,
    previousQuantity: current,
    newQuantity: current - quantity,
  });

  return true;
};

inventorySchema.methods.addBack = async function(category, item, quantity) {
  const fieldMap = {
    'general_beds': ['beds', 'general'],
    'icu_beds': ['beds', 'icu'],
    'isolation_beds': ['beds', 'isolation'],
    'oxygen_cylinders': ['equipment', 'oxygenCylinders'],
    'dialysis_machines': ['equipment', 'dialysisMachines'],
    'ecg_machines': ['equipment', 'ecgMachines'],
    'ct_scan': ['equipment', 'ctScan'],
    'endoscopy': ['equipment', 'endoscopy'],
    'bp_machines': ['equipment', 'bpMachines'],
    'ultrasonography': ['equipment', 'ultrasonography'],
    'xray_machines': ['equipment', 'xrayMachines'],
    'ot_rooms': ['rooms', 'ot'],
    'saline': ['supplies', 'saline'],
    'injections': ['supplies', 'injections'],
    'antibodies': ['supplies', 'antibodies'],
    'available_nurses_count': ['staff', 'availableNurses'],
  };

  const path = fieldMap[item];
  if (!path) return false;

  const current = this[path[0]][path[1]] || 0;
  this[path[0]][path[1]] = current + quantity;

  this.transactionLog.push({
    type: 'deallocation',
    itemName: item,
    category,
    quantityChange: quantity,
    previousQuantity: current,
    newQuantity: current + quantity,
  });

  return true;
};

inventorySchema.methods.checkLowStock = function() {
  const alerts = [];
  const threshold = 5;

  if (this.beds.general < threshold) alerts.push({ item: 'General Beds', count: this.beds.general, threshold });
  if (this.beds.icu < threshold) alerts.push({ item: 'ICU Beds', count: this.beds.icu, threshold });
  if (this.beds.isolation < threshold) alerts.push({ item: 'Isolation Beds', count: this.beds.isolation, threshold });
  if (this.equipment.oxygenCylinders < threshold) alerts.push({ item: 'Oxygen Cylinders', count: this.equipment.oxygenCylinders, threshold });
  if (this.equipment.dialysisMachines < threshold) alerts.push({ item: 'Dialysis Machines', count: this.equipment.dialysisMachines, threshold });
  if (this.rooms.ot < threshold) alerts.push({ item: 'OT Rooms', count: this.rooms.ot, threshold });
  if (this.supplies.saline < threshold) alerts.push({ item: 'Saline', count: this.supplies.saline, threshold });
  if (this.supplies.injections < threshold) alerts.push({ item: 'Injections', count: this.supplies.injections, threshold });
  if (this.supplies.antibodies < threshold) alerts.push({ item: 'Antibodies', count: this.supplies.antibodies, threshold });

  return alerts;
};

const Inventory = mongoose.model('Inventory', inventorySchema);

export default Inventory;
