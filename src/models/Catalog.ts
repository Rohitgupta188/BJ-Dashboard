// models/Catalog.ts

import mongoose, { Schema, Document, models, model } from "mongoose";

export interface ICatalog extends Document {
  designNumber: string; // Our primary business key

  rfid: string;
  sku: string;

  imageName: string;
  storageProvider?: string;   // backblaze
  storagePath?: string;       // catalog/DZER-11742.jpg
  imageUrl?: string;
  imageKitFileId?: string;

  itemStatus: string;

  itemType: string;

  isCatalog: boolean;

  isInstock: boolean;

  grossWeight: number;
  netWeight: number;

  collectionLine: string;
  metalType: string;
  metalPurity: string;
  StoneWeight: string;

  createdAt: Date;
  updatedAt: Date;
}

const CatalogSchema = new Schema<ICatalog>(
  {

    designNumber: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    rfid: {
      type: String,
      required: true,
      index: true,
    },

    sku: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    imageName: {
      type: String,
      required: true,
    },

    storageProvider: {
      type: String,
      enum: ["backblaze", "imagekit"],
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

    itemType: String,

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

    grossWeight: Number,
    netWeight: Number,

    collectionLine: String,
    metalType: String,
    metalPurity: String,
    StoneWeight: Number,

  },
  {
    timestamps: true,
  }
);

CatalogSchema.index({ designNumber: 1, sku: 1, });

const Catalog =
  (models.Catalog as mongoose.Model<ICatalog>) ||
  model<ICatalog>("Catalog", CatalogSchema);

export default Catalog;