const mongoose = require('mongoose');

const DealerSchema = new mongoose.Schema(
  {
    // National ID / passport number - used as the login identifier
    idNumber: {
      type: String,
      required: [true, 'ID number is required'],
      unique: true,
      trim: true,
      index: true,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    dealerCode: {
      type: String,
      trim: true,
    },
    // Only admin-created dealers may log in. Set false to suspend a BA
    // without deleting their history of scanned lines.
    active: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Dealer', DealerSchema);
