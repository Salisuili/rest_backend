// backend/src/utils/uploadImage.js
import supabase from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid'; // For generating unique file names

/**
 * Uploads an image to Supabase Storage.
 * @param {Buffer} fileBuffer - The image file buffer.
 * @param {string} fileName - The original file name (e.g., "myimage.jpg").
 * @param {string} bucketName - The name of the Supabase Storage bucket (e.g., "menu-images", "user-avatars").
 * @returns {Promise<string>} - The public URL of the uploaded image.
 * @throws {Error} If the upload fails.
 */
export const uploadImage = async (fileBuffer, originalFileName, bucketName) => {
    if (!fileBuffer || !originalFileName || !bucketName) {
        throw new Error('Missing file buffer, file name, or bucket name for upload.');
    }

    const fileExtension = originalFileName.split('.').pop();
    const uniqueFileName = `${uuidv4()}.${fileExtension}`; // Generate a unique name for the file

    const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(uniqueFileName, fileBuffer, {
            contentType: `image/${fileExtension}`, // Adjust content type if needed
            upsert: false // Set to true if you want to overwrite existing files with the same unique name
        });

    if (error) {
        throw new Error(`Image upload failed: ${error.message}`);
    }

    // Get the public URL of the uploaded file
    const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(uniqueFileName);

    if (publicUrlData && publicUrlData.publicUrl) {
        return publicUrlData.publicUrl;
    } else {
        throw new Error('Failed to get public URL for the uploaded image.');
    }
};

