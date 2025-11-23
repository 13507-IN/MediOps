import mongoose from 'mongoose';

const resourceSchema = new mongoose.Schema(
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
    fileName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    processingStatus: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
    },
    extractedText: {
      type: String,
      default: '',
    },
    // Structured resource data from Gemini
    resourceData: {
      doctors: [
        {
          name: String,
          available_days: String,
          time: String,
        },
      ],
      nurses: [
        {
          name: String,
          available_days: String,
          time: String,
        },
      ],
      inventory: {
        medicines: [{ name: String, count: Number }],
        saline: Number,
        injections: Number,
        antibodies: Number,
        ot_rooms: Number,
        general_beds: Number,
        icu_beds: Number,
        isolation_beds: Number,
        oxygen_cylinders: Number,
        dialysis_machines: Number,
        available_nurses_count: Number,
        instruments: [{ name: String, count: Number }],
        ecg_machines: Number,
        ct_scan: Number,
        endoscopy: Number,
        bp_machines: Number,
        ultrasonography: Number,
        xray_machines: Number,
        other_equipment: [{ name: String, count: Number }],
      },
    },
    metadata: {
      pageCount: Number,
      processingDate: String,
      aiModel: String,
    },
    errorMessage: String,
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
resourceSchema.index({ userId: 1, createdAt: -1 });
resourceSchema.index({ processingStatus: 1 });

const Resource = mongoose.model('Resource', resourceSchema);

export default Resource;


