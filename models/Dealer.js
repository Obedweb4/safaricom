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
    lastLoginAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Dealer', DealerSchema);
