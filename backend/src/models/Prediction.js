import mongoose from 'mongoose';

const predictionSchema = new mongoose.Schema(
  {
    region: {
      type: String,
      required: true,
      index: true,
    },
    hospitalId: {
      type: String,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    surgeProbability: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    estimatedPatientCount: {
      type: Number,
      default: 0,
    },
    modelVersion: {
      type: String,
      default: 'gemini-1.5-flash',
    },
    inputSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    staffAdvice: {
      doctors: Number,
      nurses: Number,
      supportStaff: Number,
      notes: String,
    },
    supplyAdvice: {
      oxygen: Number,
      medicines: Array,
      ppe: Number,
      notes: String,
    },
    topFactors: [
      {
        feature: String,
        impact: Number,
      },
    ],
    suggestedMedicines: [String],
    suggestedDiseases: [String],
    activePandemics: [{
      diseaseName: String,
      activeCases: Number,
      newCases: Number,
      severity: String,
      transmissionRate: Number,
    }],
    weatherImpact: String,
    aqiImpact: String,
  },
  {
    timestamps: true,
  }
);

predictionSchema.index({ region: 1, date: -1 });

const Prediction = mongoose.model('Prediction', predictionSchema);

export default Prediction;



