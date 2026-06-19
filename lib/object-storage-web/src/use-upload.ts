import { useState, useCallback } from "react";

interface UploadResponse {
  objectPath: string;
  uploadURL?: string;
}

interface UseUploadOptions {
  basePath?: string;
  headers?: Record<string, string>;
  onSuccess?: (response: UploadResponse) => void;
  onError?: (error: Error) => void;
}

export function useUpload(options: UseUploadOptions = {}) {
  const basePath = options.basePath ?? "/api/storage";
  const extraHeaders = options.headers;
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(0);

  const uploadFile = useCallback(
    async (file: File): Promise<UploadResponse | null> => {
      setIsUploading(true);
      setError(null);
      setProgress(0);

      try {
        setProgress(20);
        const formData = new FormData();
        formData.append("file", file);

        const headers: Record<string, string> = { ...(extraHeaders ?? {}) };

        const response = await fetch(`${basePath}/uploads`, {
          method: "POST",
          headers,
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Gagal upload file");
        }

        const data: UploadResponse = await response.json();
        setProgress(100);
        options.onSuccess?.(data);
        return data;
      } catch (err) {
        const uploadError = err instanceof Error ? err : new Error("Upload gagal");
        setError(uploadError);
        options.onError?.(uploadError);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [basePath, extraHeaders, options]
  );

  return {
    uploadFile,
    isUploading,
    error,
    progress,
  };
}
