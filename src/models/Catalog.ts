import mongoose, { Schema, Document, models, model } from "mongoose";

export interface ICatalog extends Document {
  sku: string;
  designNumber: string;
  rfid: string;

  imageName: string;
  storageProvider: "backblaze";
  storagePath: string;
  imageUrl: string;
  imageKitFileId: string;

  itemStatus: "CATALOGUE" | "INSTOCK";
  itemType?: string;

  isCatalog: boolean;
  isInstock: boolean;

  grossWeight: number;
  netWeight: number;
  stoneWeight: number;

  collectionLine: string;
  metalType: string;
  metalPurity: string;

  createdAt: Date;
  updatedAt: Date;
}

const CatalogSchema = new Schema<ICatalog>(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    designNumber: {
      type: String,
      required: true,
      index: true, 
      trim: true,
    },

    rfid: {
      type: String,
      required: true,
      trim: true,
    },

    imageName: {
      type: String,
      required: true,
      trim: true,
    },

    storageProvider: {
      type: String,
      default: "backblaze",
    },

    storagePath: {
      type: String,
      index: true,
    },

    imageUrl: {
      type: String,
    },

    imageKitFileId: {
      type: String,
    },

    itemStatus: {
      type: String,
      enum: ["CATALOGUE", "INSTOCK"],
      required: true,
      index: true,
    },

    itemType: {
      type: String,
      trim: true,
    },

    isCatalog: {
      type: Boolean,
      default: false,
      index: true,
    },

    isInstock: {
      type: Boolean,
      default: false,
      index: true,
    },

    grossWeight: {
      type: Number,
      min: 0,
    },

    netWeight: {
      type: Number,
      min: 0,
    },

    stoneWeight: {
      type: Number,
      min: 0,
    },

    collectionLine: {
      type: String,
      trim: true,
    },

    metalType: {
      type: String,
      trim: true,
    },

    metalPurity: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "catalogs",
  }
);

const Catalog =
  (models.Catalog as mongoose.Model<ICatalog>) ||
  model<ICatalog>("Catalog", CatalogSchema);

export default Catalog;