import mongoose, { Schema, models, model } from "mongoose";

export interface IDriveChannel {
  _id: string;                    // singleton key — always "main"
  channelId: string;              // UUID we assigned when registering the channel
  resourceId: string;             // Google's resource ID (required to stop the channel)
  pageToken: string;              // Latest committed drive.changes.list page token
  expiresAt: Date;                // When Google will stop sending notifications
  renewedAt?: Date;               // Last time we successfully renewed
  /**
   * Checkpoint fields for the "checkpoint-before-work" pattern.
   * When we start processing a page of changes we immediately write the
   * next page's token here. If Vercel times out mid-page the next
   * invocation resumes from this page and skips already-processed changes
   * (identified by pendingChangeIndex).
   */
  pendingPageToken?: string;      // token for the page currently being processed
  pendingChangeIndex?: number;    // 0-based index of last change successfully handled in that page
}

const DriveChannelSchema = new Schema<IDriveChannel>(
  {
    _id:               { type: String },  // allows "main" as a singleton doc ID
    channelId:         { type: String, required: true },
    resourceId:        { type: String, required: true },
    pageToken:         { type: String, required: true },
    expiresAt:         { type: Date,   required: true },
    renewedAt:         { type: Date },
    pendingPageToken:  { type: String },
    pendingChangeIndex:{ type: Number },
  },
  { timestamps: true, collection: "drive_channels" }
);

const DriveChannel =
  (models.DriveChannel as mongoose.Model<IDriveChannel>) ||
  model<IDriveChannel>("DriveChannel", DriveChannelSchema);

export default DriveChannel;
