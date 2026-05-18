# PO → Tally Portal

Automates Purchase Order data entry into TallyPrime.
Upload SF PO + vendor email PO → parse → review & edit → push to Tally.

---

## Setup

### Prerequisites
- Node.js 18+
- TallyPrime running with Gateway Server enabled on port 9000

### Install & Run

```bash
# 1. Install all dependencies (root + client)
npm run install:all

# 2. Start both server and client
npm run dev
```

Open http://localhost:5173 in your browser.

---

## Project Structure

```
po-tally-portal/
├── server/
│   ├── index.js                  # Express server (port 3001)
│   ├── parser/
│   │   ├── utils.js              # Shared regex/number/GST helpers
│   │   ├── detectFormat.js       # Borkar vs Parksons auto-detection
│   │   ├── parseSalesforcePO.js  # SF PO parser
│   │   ├── parseBorkarPO.js      # Borkar + Parksons (stub) parsers
│   │   └── mergePO.js            # Merge both → unified JSON
│   ├── tally/
│   │   ├── buildXML.js           # JSON → Tally Purchase Order XML
│   │   └── sendToTally.js        # axios POST to localhost:9000
│   └── routes/
│       ├── upload.js             # POST /api/upload
│       └── tally.js              # POST /api/tally/push, GET /api/tally/status
├── client/
│   └── src/
│       ├── App.jsx               # Upload → Review → Result flow
│       ├── utils/api.js          # Axios API calls
│       └── components/
│           ├── UploadScreen.jsx  # Drag & drop both PDFs
│           ├── ReviewScreen.jsx  # Edit extracted fields, line items, totals
│           ├── ResultScreen.jsx  # Success / error after Tally push
│           └── TallyStatus.jsx   # Live Tally connection indicator
└── README.md
```

---

## Enabling TallyPrime Gateway Server

1. Open TallyPrime → press F12
2. Go to Connectivity (or Advanced Configuration)
3. Set **Enable Tally Gateway Server** → Yes
4. Port: 9000
5. Restart TallyPrime

Test: visit http://localhost:9000 in browser — any response means it's working.

---

## Adding Parksons PO Support

Edit `server/parser/parseBorkarPO.js` → fill in `parseParksons()` function.
Share a sample Parksons PO PDF to get the field mapping done.

---

## Configuration

- **Tally company name**: Edit `TALLY_COMPANY` in `server/tally/buildXML.js`
- **GST rate**: Edit `GST_RATE` in `server/parser/mergePO.js` (default: 18%)
- **Tally port**: Edit `TALLY_PORT` in `server/tally/sendToTally.js` (default: 9000)
