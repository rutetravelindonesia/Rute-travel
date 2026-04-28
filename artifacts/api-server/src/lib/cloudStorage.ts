import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  mimetype: string,
  folder: string = "rute-travel"
): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        format: mimetype.startsWith("image/") ? undefined : undefined,
      },
      (error, result) => {
        if (error) return reject(new Error(error.message));
        if (!result) return reject(new Error("No result from Cloudinary"));
        resolve(result.secure_url);
      }
    );
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
}

export async function deleteFromCloudinary(url: string): Promise<void> {
  try {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.split("/");
    const uploadIndex = parts.indexOf("upload");
    if (uploadIndex === -1) return;
    const publicIdWithExt = parts.slice(uploadIndex + 2).join("/");
    const publicId = publicIdWithExt.replace(/\.[^.]+$/, "");
    await cloudinary.uploader.destroy(publicId);
  } catch {
  }
}
