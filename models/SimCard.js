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
    // The dealer/agent this line of stock is allocated to. Null until an
    // admin allocates it - a BA can only scan lines allocated to them.
    dealer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dealer',
      default: null,
      index: true,
    },
    // Denormalized snapshot of the dealer's details at scan time, so the
    // ledger and CSV export still read correctly even if a dealer record
    // is later edited or removed.
    dealerName: {
      type: String,
      trim: true,
    },
    dealerIdNumber: {
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
    // unallocated -> just added to stock by admin, no BA assigned yet
    // allocated   -> assigned to a BA, waiting to be scanned
    // scanned/registered/activated/rejected -> the BA has processed it
    status: {
      type: String,
      enum: ['unallocated', 'allocated', 'scanned', 'registered', 'activated', 'rejected'],
      default: 'unallocated',
    },
    notes: {
      type: String,
      trim: true,
    },
    allocatedAt: {
      type: Date,
    },
    scannedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SimCard', SimCardSchema);
