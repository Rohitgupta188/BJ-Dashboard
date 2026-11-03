import mongoose, { Schema, Document, models, model } from "mongoose";

export interface IImageIndex extends Document {
  fileId:         string;
  imageName:      string;
  mimeType:       string;
  parentFolderId: string;
  backblazePath:  string | null;
  imageUrl:       string | null;
  imageMd5:       string | null;
  uploadStatus:   "PENDING" | "UPLOADING" | "UPLOADED" | "FAILED";
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
    backblazePath: {
      type:    String,
      default: null,
    },
    imageUrl: {
      type:    String,
      default: null,
    },
    imageMd5: {
      type:    String,
      default: null,
      trim:    true,
    },
    uploadStatus: {
      type:     String,
      enum:     ["PENDING", "UPLOADING", "UPLOADED", "FAILED"],
      default:  "PENDING",
      required: true,
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
ImageIndexSchema.index({ uploadStatus: 1 });

const ImageIndex =
  (models.ImageIndex as mongoose.Model<IImageIndex>) ||
  model<IImageIndex>("ImageIndex", ImageIndexSchema);

export default ImageIndex;
