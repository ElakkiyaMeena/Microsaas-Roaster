import { useNavigate } from 'react-router-dom';
import { FiSearch } from 'react-icons/fi';
import { GlassCard } from '../ui/GlassCard';
import { EmptyState } from '../ui/EmptyState';
import { GradientButton } from '../ui/GradientButton';

/** Friendly 404 state for a missing (or someone else's) submission. */
export function SubmissionNotFound() {
  const navigate = useNavigate();
  return (
    <GlassCard hoverable={false}>
      <EmptyState
        icon={FiSearch}
        title="Submission not found"
        description="It may have been deleted, or it never existed. Either way, there is nothing to roast here."
        action={
          <GradientButton onClick={() => navigate('/submissions')}>Back to submissions</GradientButton>
        }
      />
    </GlassCard>
  );
}

export default SubmissionNotFound;
