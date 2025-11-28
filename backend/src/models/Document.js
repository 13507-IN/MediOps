import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    userEmail: {
      type: String,
      required: true,
    },
    hospitalId: {
      type: String,
      index: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    ocrText: {
      type: String,
      default: '',
    },
    ocrConfidence: {
      type: Number,
      default: 0,
    },
    extractedData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    processingStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    errorMessage: {
      type: String,
      default: '',
    },
    metadata: {
      pageCount: Number,
      language: String,
      detectedEntities: [String],
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
documentSchema.index({ userId: 1, createdAt: -1 });
documentSchema.index({ hospitalId: 1, createdAt: -1 });
documentSchema.index({ processingStatus: 1 });

const Document = mongoose.model('Document', documentSchema);

export default Document;
