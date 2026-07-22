import mongoose, { Schema, Document, models, model } from "mongoose";

export interface IQuotationLineItem {
  sku: string;
  designNumber: string;
  itemType?: string;
  grossWeight?: number;
  netWeight?: number;
  stoneWeight?: number;
  metalPurity?: string;
  metalType?: string;
  imageUrl?: string;
  qty: number;
  remarks?: string;
}

export interface IQuotation extends Document {
  quotationNo: string;
  date: Date;

  customerId?: string;
  companyName: string;
  contactName: string;
  email?: string;
  address: string;
  contactNumber: string;
  remarks?: string;

  lineItems: IQuotationLineItem[];

  totalGrossWeight: number;
  totalNetWeight: number;
  totalItems: number;

  createdAt: Date;
  updatedAt: Date;
}

const LineItemSchema = new Schema<IQuotationLineItem>(
  {
    sku: { type: String, required: true },
    designNumber: { type: String, required: true },
    itemType: { type: String },
    grossWeight: { type: Number, default: 0 },
    netWeight: { type: Number, default: 0 },
    stoneWeight: { type: Number, default: 0 },
    metalPurity: { type: String },
    metalType: { type: String },
    imageUrl: { type: String },
    qty: { type: Number, default: 1 },
    remarks: { type: String },
  },
  { _id: false }
);

const QuotationSchema = new Schema<IQuotation>(
  {
    quotationNo: { type: String, required: true, unique: true, index: true },
    date: { type: Date, default: () => new Date() },

    customerId: { type: String },
    companyName: { type: String, required: true, trim: true },
    contactName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, required: true, trim: true },
    contactNumber: { type: String, required: true, trim: true },
    remarks: { type: String },

    lineItems: { type: [LineItemSchema], default: [] },

    totalGrossWeight: { type: Number, default: 0 },
    totalNetWeight: { type: Number, default: 0 },
    totalItems: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: "quotations",
  }
);

const Quotation =
  (models.Quotation as mongoose.Model<IQuotation>) ||
  model<IQuotation>("Quotation", QuotationSchema);

export default Quotation;
