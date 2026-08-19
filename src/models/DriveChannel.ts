import mongoose, { Schema, models, model } from "mongoose";

export interface IDriveChannel {
  _id: string;                   
  channelId: string;             
  resourceId: string;            
  pageToken: string;             
  expiresAt: Date;                
  renewedAt?: Date;              
  pendingPageToken?: string;     
  pendingChangeIndex?: number;   
  processingLockedAt?: Date;     
  renewLockedAt?: Date;
  pendingWork?: boolean;
  lastModifiedTime?: Map<string, string>;
  lastExcelContentHash?: Map<string, string>;
  lastSheetHash?: Map<string, string>;
}

const DriveChannelSchema = new Schema<IDriveChannel>(
  {
    _id:               { type: String }, 
    channelId:         { type: String, required: true },
    resourceId:        { type: String, required: true },
    pageToken:         { type: String, required: true },
    expiresAt:         { type: Date,   required: true },
    renewedAt:         { type: Date },
    pendingPageToken:   { type: String },
    pendingChangeIndex: { type: Number },
    processingLockedAt: { type: Date },
    renewLockedAt:      { type: Date },
    pendingWork:        { type: Boolean },
    lastModifiedTime:   { type: Map, of: String },
    lastExcelContentHash: { type: Map, of: String },
    lastSheetHash:        { type: Map, of: String },
  },
  { timestamps: true, collection: "drive_channels" }
);

const DriveChannel =
  (models.DriveChannel as mongoose.Model<IDriveChannel>) ||
  model<IDriveChannel>("DriveChannel", DriveChannelSchema);

export default DriveChannel;
