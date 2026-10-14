import { useDropzone, type Accept } from 'react-dropzone'
import { Box, Typography } from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'

interface Props {
  accept: Accept
  file: File | null
  onFile: (file: File) => void
  disabled?: boolean
  hint: string
}

export default function UploadDropzone({ accept, file, onFile, disabled, hint }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    multiple: false,
    disabled,
    onDropAccepted: (files) => onFile(files[0]),
  })

  return (
    <Box
      {...getRootProps()}
      sx={{
        border: 2,
        borderStyle: 'dashed',
        borderColor: isDragActive ? 'primary.main' : 'divider',
        borderRadius: 3,
        p: { xs: 3, sm: 5 },
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        bgcolor: isDragActive ? 'rgba(79,195,247,0.08)' : 'transparent',
        transition: 'all .2s',
      }}
    >
      <input {...getInputProps()} />
      {file ? (
        <>
          <InsertDriveFileIcon color="primary" sx={{ fontSize: 40 }} />
          <Typography fontWeight={600}>{file.name}</Typography>
          <Typography variant="body2" color="text.secondary">{(file.size / 1024 / 1024).toFixed(1)} MB · click or drop to change</Typography>
        </>
      ) : (
        <>
          <CloudUploadIcon color="primary" sx={{ fontSize: 40 }} />
          <Typography fontWeight={600}>{isDragActive ? 'Drop the file here' : 'Drag a file here, or click to choose'}</Typography>
          <Typography variant="body2" color="text.secondary">{hint}</Typography>
        </>
      )}
    </Box>
  )
}
