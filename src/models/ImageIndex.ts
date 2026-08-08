import mongoose, { Schema, Document, models, model } from "mongoose";

export interface IImageIndex extends Document {
  fileId:         string; 
  imageName:      string; 
  mimeType:       string;  
  parentFolderId: string; 
  createdAt:      Date;
  updatedAt:      Date;
}

const ImageIndexSchema = new Schema<IImageIndex>(
  {
    fileId: {
      type:     String,
      required: true,
      unique:   true,
      trim:     true,
    },
    imageName: {
      type:     String,
      required: true,
      trim:     true,
    },
    mimeType: {
      type:     String,
      required: true,
      trim:     true,
    },
    parentFolderId: {
      type:     String,
      required: true,
      trim:     true,
    },
  },
  {
    timestamps:  true,
    collection: "image_index",
  }
);

ImageIndexSchema.index(
  { imageName: 1 },
  { collation: { locale: "en", strength: 2 } } 
);

ImageIndexSchema.index({ parentFolderId: 1 });

const ImageIndex =
  (models.ImageIndex as mongoose.Model<IImageIndex>) ||
  model<IImageIndex>("ImageIndex", ImageIndexSchema);

export default ImageIndex;
