import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  HStack,
  Icon,
  List,
  ListItem,
  Progress,
  Stack,
  Text,
  VisuallyHiddenInput,
} from '@chakra-ui/react';
import { FiArchive, FiFileText, FiUploadCloud, FiX } from 'react-icons/fi';
import { ALLOWED_UPLOAD_EXTENSIONS } from '../../types';
import { MotionBox } from '../ui/motion';
import { ActionButton } from './ActionButton';
import {
  fileKey,
  formatBytes,
  isZip,
  UPLOAD_LIMITS,
  validateIncomingFiles,
} from './uploadValidation';

export interface CodeDropzoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  isDisabled?: boolean;
  /** Upload progress 0–100 while submitting. */
  progress?: number | null;
  /** External validation error (e.g. "select at least one file"). */
  error?: string;
}

/** Drag & drop / click-to-pick multi-file input with client-side validation. */
export function CodeDropzone({
  files,
  onChange,
  isDisabled = false,
  progress = null,
  error,
}: CodeDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [errors, setErrors] = useState<string[]>([]);

  const addFiles = (incoming: File[]): void => {
    if (isDisabled || incoming.length === 0) return;
    const result = validateIncomingFiles(files, incoming);
    setErrors(result.errors);
    if (result.accepted.length > 0) onChange([...files, ...result.accepted]);
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>): void => {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (!isDisabled) setIsDragging(true);
  };

  const openPicker = (): void => {
    if (!isDisabled) inputRef.current?.click();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  };

  const removeFile = (target: File): void => {
    const key = fileKey(target);
    onChange(files.filter((f) => fileKey(f) !== key));
    setErrors([]);
  };

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const allMessages = [...(error ? [error] : []), ...errors];

  return (
    <Stack spacing={3}>
      <MotionBox
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-label="Upload code files: drop files here or press Enter to browse"
        aria-disabled={isDisabled}
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        whileHover={isDisabled ? undefined : { scale: 1.01 }}
        whileTap={isDisabled ? undefined : { scale: 0.99 }}
        animate={{ scale: isDragging ? 1.02 : 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        borderWidth="2px"
        borderStyle="dashed"
        borderColor={isDragging ? 'brand.400' : error ? 'red.400' : 'border.subtle'}
        bg={isDragging ? 'brand.50' : 'bg.surface'}
        _dark={{ bg: isDragging ? 'whiteAlpha.200' : 'bg.surface' }}
        borderRadius="2xl"
        p={8}
        textAlign="center"
        cursor={isDisabled ? 'not-allowed' : 'pointer'}
        opacity={isDisabled ? 0.6 : 1}
        _focusVisible={{ outline: '2px solid', outlineColor: 'brand.400' }}
      >
        <Icon as={FiUploadCloud} boxSize={10} color="brand.400" mb={2} aria-hidden="true" />
        <Text fontWeight="semibold">Drag & drop files here, or click to browse</Text>
        <Text fontSize="sm" color="text.muted" mt={1}>
          Up to {UPLOAD_LIMITS.maxFiles} files · {formatBytes(UPLOAD_LIMITS.maxFileBytes)} per file
          · {formatBytes(UPLOAD_LIMITS.maxZipBytes)} per .zip
        </Text>
        <Text fontSize="xs" color="text.muted" mt={1}>
          {ALLOWED_UPLOAD_EXTENSIONS.join(' ')}
        </Text>
      </MotionBox>
      <VisuallyHiddenInput
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_UPLOAD_EXTENSIONS.join(',')}
        onChange={handleInput}
        disabled={isDisabled}
        data-testid="file-input"
        aria-label="Choose files"
      />

      {allMessages.length > 0 && (
        <Alert status="error" borderRadius="lg" alignItems="flex-start">
          <AlertIcon />
          <List spacing={1} fontSize="sm">
            {allMessages.map((msg, i) => (
              <ListItem key={`${i}-${msg}`}>{msg}</ListItem>
            ))}
          </List>
        </Alert>
      )}

      {files.length > 0 && (
        <Box>
          <HStack justify="space-between" mb={2}>
            <Text fontSize="sm" fontWeight="semibold">
              {files.length} file{files.length === 1 ? '' : 's'} selected
            </Text>
            <Text fontSize="xs" color="text.muted">
              {formatBytes(totalBytes)}
            </Text>
          </HStack>
          <List spacing={2} aria-label="Selected files">
            {files.map((file) => (
              <ListItem
                key={fileKey(file)}
                display="flex"
                alignItems="center"
                gap={3}
                px={3}
                py={2}
                borderWidth="1px"
                borderColor="border.subtle"
                borderRadius="lg"
              >
                <Icon as={isZip(file) ? FiArchive : FiFileText} color="brand.400" aria-hidden="true" />
                <Text flex="1" fontSize="sm" fontFamily="mono" noOfLines={1} title={file.name}>
                  {file.name}
                </Text>
                <Text fontSize="xs" color="text.muted">
                  {formatBytes(file.size)}
                </Text>
                <ActionButton
                  size="xs"
                  variant="ghost"
                  onClick={() => removeFile(file)}
                  isDisabled={isDisabled}
                  aria-label={`Remove ${file.name}`}
                >
                  <FiX />
                </ActionButton>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {progress !== null && (
        <Progress
          value={progress}
          size="sm"
          colorScheme="orange"
          borderRadius="full"
          aria-label="Upload progress"
          hasStripe
          isAnimated
        />
      )}
    </Stack>
  );
}

export default CodeDropzone;
