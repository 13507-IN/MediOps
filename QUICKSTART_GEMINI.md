# 🚀 Quick Start Guide - Gemini PDF Analysis

## ✅ Setup Complete!

Your healthcare application now has **AI-powered PDF analysis** using Google's Gemini 2.0 Flash model.

## 📋 What You Need to Do

### 1. Get Your Gemini API Key (Required)

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated API key

### 2. Update Backend Environment

Open `/backend/.env` and replace the placeholder:

```env
GEMINI_API_KEY=your_actual_api_key_here
```

**Example:**
```env
GEMINI_API_KEY=AIzaSyDXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### 3. Restart the Backend Server

```bash
cd backend
npm run dev
```

The server should start successfully on `http://localhost:5000`

### 4. Start the Frontend

```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:3000`

## 🎯 Testing the Integration

### Option 1: Using the Web Interface

1. Navigate to `http://localhost:3000/upload`
2. Upload a medical PDF (5-10MB)
3. Watch the AI analysis appear instantly!

### Option 2: Using cURL

```bash
# Get your auth token from Clerk (check browser dev tools)
export AUTH_TOKEN="your_clerk_token_here"

# Upload and analyze a PDF
curl -X POST http://localhost:5000/api/pdf/analyze \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -F "pdf=@/path/to/medical-document.pdf"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "PDF analyzed successfully",
  "data": {
    "documentId": "67890abcdef...",
    "fileName": "lab-report.pdf",
    "pageCount": 3,
    "analysis": {
      "documentType": "Lab Report",
      "patientInfo": {
        "name": "John Doe",
        "age": 45,
        "id": "P123456"
      },
      "medicalConditions": ["Hypertension", "Type 2 Diabetes"],
      "medications": [
        {
          "name": "Metformin",
          "dosage": "500mg",
          "frequency": "twice daily"
        }
      ],
      "testResults": [
        {
          "test": "HbA1c",
          "value": "7.2",
          "unit": "%",
          "referenceRange": "4.0-5.6"
        }
      ],
      "summary": "Lab report showing elevated HbA1c levels...",
      "confidence": "high"
    }
  }
}
```

## 🔥 New Features Available

### 1. **AI Document Analysis**
- Automatic document type detection
- Patient information extraction
- Medical condition identification
- Medication parsing with dosage
- Lab test results with reference ranges

### 2. **Smart Q&A**
Ask questions about uploaded documents:

```bash
curl -X POST http://localhost:5000/api/pdf/question/DOCUMENT_ID \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are the patient'\''s current medications?"
  }'
```

### 3. **Enhanced Upload Page**
- Real-time AI analysis display
- Document type badges
- Confidence scores
- Summary previews

## 📊 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pdf/analyze` | POST | Upload & analyze PDF with AI |
| `/api/pdf/question/:id` | POST | Ask questions about a document |
| `/api/pdf/documents` | GET | List all documents |
| `/api/pdf/documents/:id` | GET | Get document with full analysis |
| `/api/pdf/documents/:id` | DELETE | Delete a document |

## 🎨 Frontend Updates

The upload page (`/app/upload/page.tsx`) now shows:

- 🤖 **AI Analysis Badge** - Document type identification
- 📄 **Page Count** - Number of pages processed
- 🎯 **Confidence Score** - AI confidence level (high/medium/low)
- 📝 **Summary Preview** - Quick overview of document content

## 🔧 Troubleshooting

### Server Won't Start (Port in Use)
```bash
# Kill process on port 5000
lsof -ti:5000 | xargs kill -9

# Restart
npm run dev
```

### API Key Not Working
- Verify the key is correct in `.env`
- Check for extra spaces or quotes
- Ensure you have API quota remaining
- Restart the server after updating `.env`

### MongoDB Connection Error
```bash
# Start MongoDB (macOS with Homebrew)
brew services start mongodb-community

# Or check if it's running
brew services list
```

### PDF Upload Fails
- Ensure file is between 5-10MB
- Check file is actually a PDF
- Verify authentication token is valid
- Check backend logs for detailed errors

## 📁 File Structure

```
healthcare-landing/
├── backend/
│   ├── src/
│   │   ├── services/
│   │   │   └── geminiService.js      ✨ NEW
│   │   ├── routes/
│   │   │   └── pdfRoutes.js          ✨ NEW
│   │   └── server.js                 📝 Updated
│   ├── .env                          📝 Updated
│   └── GEMINI_PDF_INTEGRATION.md     ✨ NEW
├── frontend/
│   ├── app/
│   │   └── upload/
│   │       └── page.tsx              📝 Updated
│   └── .env.example                  📝 Updated
└── QUICKSTART_GEMINI.md              ✨ NEW (this file)
```

## 🎓 Next Steps

1. **Customize AI Prompts** - Edit `geminiService.js` to adjust analysis focus
2. **Add More Features** - Implement document comparison, trend analysis
3. **Enhance UI** - Create detailed document view pages
4. **Add Notifications** - Alert users when processing completes
5. **Export Options** - Allow downloading analysis as PDF/JSON

## 💡 Tips

- **Test with Sample PDFs** - Start with simple medical documents
- **Monitor API Usage** - Check Google AI Studio for quota limits
- **Adjust Confidence Thresholds** - Customize based on your needs
- **Cache Results** - Analysis is stored in MongoDB for quick retrieval

## 📞 Support

- **Backend Logs**: Check terminal where `npm run dev` is running
- **Frontend Logs**: Open browser DevTools → Console
- **API Testing**: Use Postman or curl for debugging
- **Documentation**: See `GEMINI_PDF_INTEGRATION.md` for detailed API docs

---

**Status**: ✅ Ready to Use  
**Server**: http://localhost:5000  
**Frontend**: http://localhost:3000  
**Model**: Gemini 2.0 Flash Experimental  

🎉 **Your AI-powered healthcare document analysis system is ready!**
......