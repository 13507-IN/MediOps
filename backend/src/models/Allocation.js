import mongoose from 'mongoose';

const allocationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userEmail: {
      type: String,
      required: true,
    },
    hospitalId: {
      type: String,
      required: true,
      index: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
    patientInfo: {
      name: String,
      age: String,
      gender: String,
      id: String,
      contactNumber: String,
      email: String,
    },
    prescriptionDetails: {
      doctorName: String,
      medicines: [
        {
          name: String,
          dosage: String,
          frequency: String,
          duration: String,
        },
      ],
      diagnosis: String,
      visitDate: String,
    },
    allocatedResources: {
      beds: {
        bedType: String, // 'general', 'icu', 'isolation'
        bedNumber: String,
        quantity: Number,
        allocatedDate: Date,
      },
      oxygenCylinders: {
        quantity: Number,
        allocatedDate: Date,
      },
      dialysis: {
        sessions: Number,
        frequency: String,
        allocatedDate: Date,
      },
      otherServices: [
        {
          serviceName: String,
          serviceType: String,
          quantity: Number,
          allocatedDate: Date,
        },
      ],
    },
    resourceSnapshot: {
      // Store resources before allocation for audit trail
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['pending', 'allocated', 'deallocated', 'completed'],
      default: 'pending',
    },
    lifecycle: {
      status: {
        type: String,
        enum: ['admitted', 'treated', 'discharged'],
        default: 'admitted',
      },
      admittedAt: Date,
      treatedAt: Date,
      dischargedAt: Date,
      expectedDischarge: Date,
      notes: String,
    },
    notes: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
allocationSchema.index({ userId: 1, createdAt: -1 });
allocationSchema.index({ hospitalId: 1, createdAt: -1 });
allocationSchema.index({ documentId: 1 });
allocationSchema.index({ status: 1 });

const Allocation = mongoose.model('Allocation', allocationSchema);

export default Allocation;
