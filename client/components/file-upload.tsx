'use client';
import * as React from 'react';
import { Upload, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FileUploadComponent: React.FC = () => {
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadSuccess, setUploadSuccess] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileUploadButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file) {
        setIsUploading(true);
        setUploadSuccess(false);
        setFileName(file.name);
        
        const formData = new FormData();
        formData.append('pdf', file);

        const apiKey = localStorage.getItem('gemini_api_key') || '';

        try {
          await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/pdf`, {
            method: 'POST',
            headers: {
              'x-gemini-api-key': apiKey,
            },
            body: formData,
          });
          setUploadSuccess(true);
        } catch (e) {
          console.error('Upload failed', e);
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = ''; // Reset input
          }
        }
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input 
        type="file" 
        accept="application/pdf" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
      />
      <Button 
        onClick={handleFileUploadButtonClick} 
        disabled={isUploading}
        className="w-full border-dashed border-2 bg-background hover:bg-muted text-foreground flex gap-2 h-20"
        variant="outline"
      >
        {isUploading ? <Loader2 className="animate-spin" /> : <Upload className="h-5 w-5" />}
        {isUploading ? 'Uploading...' : 'Upload PDF'}
      </Button>
      {fileName && (
        <div className="text-sm flex items-center gap-2 text-muted-foreground mt-2 px-1">
          {uploadSuccess ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          <span className="truncate">{fileName}</span>
        </div>
      )}
    </div>
  );
};

export default FileUploadComponent;
