import { useRef, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
} from '@chakra-ui/react';
import { ActionButton } from './ActionButton';

export interface ConfirmDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  title?: string;
  body?: ReactNode;
  confirmLabel?: string;
}

/** Accessible destructive-action confirmation (Chakra AlertDialog). */
export function ConfirmDeleteDialog({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  title = 'Delete submission?',
  body = 'This permanently deletes the submission, its files and all of its roasts. This cannot be undone.',
  confirmLabel = 'Delete',
}: ConfirmDeleteDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={cancelRef}
      onClose={isLoading ? () => undefined : onClose}
      isCentered
      motionPreset="slideInBottom"
    >
      <AlertDialogOverlay backdropFilter="blur(4px)">
        <AlertDialogContent borderRadius="2xl" mx={4}>
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            {title}
          </AlertDialogHeader>
          <AlertDialogBody>{body}</AlertDialogBody>
          <AlertDialogFooter gap={3}>
            <ActionButton ref={cancelRef} variant="ghost" onClick={onClose} isDisabled={isLoading}>
              Cancel
            </ActionButton>
            <ActionButton colorScheme="red" onClick={onConfirm} isLoading={isLoading}>
              {confirmLabel}
            </ActionButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}

export default ConfirmDeleteDialog;
