import mongoose, { Schema, models, model } from "mongoose";

export interface ICustomer {
  _id?: string;
  name: string;
  email?: string;
  contactName: string;
  phone: string;
  address: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    name: {
      type: String, 
      required: true, 
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: ""
    },
    contactName: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      type: String,
      required: true,
      trim: true
    },
  },
  { timestamps: true }
);

// Prevents "Cannot overwrite model" errors during Next.js hot reload.
const Customer =
  (models.Customer as mongoose.Model<ICustomer>) ||
  model<ICustomer>("Customer", CustomerSchema);

export default Customer;