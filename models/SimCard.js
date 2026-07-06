const mongoose = require('mongoose');

const SimCardSchema = new mongoose.Schema(
  {
    // The raw value read off the barcode (usually the SIM serial / ICCID)
    barcode: {
      type: String,
      required: [true, 'Barcode value is required'],
      unique: true,
      trim: true,
      index: true,
    },
    // Barcode symbology detected by the scanner (CODE_128, EAN_13, etc.)
    barcodeFormat: {
      type: String,
      trim: true,
    },
    // Optional linked mobile number, filled in by the dealer if known
    msisdn: {
      type: String,
      trim: true,
    },
    dealerName: {
      type: String,
      trim: true,
    },
    dealerCode: {
      type: String,
      trim: true,
    },
    customerName: {
      type: String,
      trim: true,
    },
    customerIdNumber: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['scanned', 'registered', 'activated', 'rejected'],
      default: 'scanned',
    },
    notes: {
      type: String,
      trim: true,
    },
    scannedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SimCard', SimCardSchema);
