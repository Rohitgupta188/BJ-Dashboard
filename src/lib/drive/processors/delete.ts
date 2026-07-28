import path                    from "path";
import Catalog                 from "@/models/Catalog";
import { deleteFromBackblaze } from "@/lib/backblaze";
import { IMAGE_MIME_TYPES }    from "./images";

const EXCEL_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

export interface DeleteResult {
  handled:  boolean;
  message:  string;
  b2Deleted?: boolean;
  dbUpdated?: number;
}

export async function processDeletedFile(
  fileId:   string,
  fileName: string | undefined | null,
  mimeType: string | undefined | null
): Promise<DeleteResult> {
  const mime = mimeType ?? "";
  const name = fileName ?? "";

  if (EXCEL_MIME_TYPES.has(mime)) {
    const deleteResult = await Catalog.deleteMany({ driveFileId: fileId });

    const msg =
      `[drive/delete] Excel "${name || fileId}" removed from Drive — ` +
      `deleted ${deleteResult.deletedCount} catalog record(s) from DB`;
    console.log(msg);

    return {
      handled:   true,
      message:   msg,
      dbUpdated: deleteResult.deletedCount,
    };
  }

  if (IMAGE_MIME_TYPES.has(mime)) {
    const designNumber = path.basename(name, path.extname(name)).trim();

    const docs = await Catalog.find(
      { imageName: { $regex: new RegExp(`^${designNumber}`, "i") } },
      { storagePath: 1, imageName: 1 }
    ).lean();

    let b2Deleted = false;

    const uniquePaths = [...new Set(docs.map((d) => d.storagePath).filter(Boolean))];
    for (const objectKey of uniquePaths) {
      try {
        const deleted = await deleteFromBackblaze(objectKey);
        if (deleted) b2Deleted = true;
        console.log(
          `[drive/delete] B2 object "${objectKey}" ${deleted ? "deleted ✓" : "already absent"}`
        );
      } catch (err) {
        console.error(`[drive/delete] Failed to delete B2 object "${objectKey}":`, err);
      }
    }

    const dbResult = await Catalog.updateMany(
      { imageName: { $regex: new RegExp(`^${designNumber}`, "i") } },
      {
        $unset: { imageUrl: "", storagePath: "", imageName: "", storageProvider: "" },
      }
    );

    const msg =
      `[drive/delete] Image "${name}" deleted — ` +
      `B2 removed: ${b2Deleted}, Catalog docs cleared: ${dbResult.modifiedCount}`;
    console.log(msg);

    return {
      handled:   true,
      message:   msg,
      b2Deleted,
      dbUpdated: dbResult.modifiedCount,
    };
  }
  
  const msg = `[drive/delete] Ignored deletion of unsupported type "${mime}" (${name || fileId})`;
  console.log(msg);
  return { handled: false, message: msg };
}
