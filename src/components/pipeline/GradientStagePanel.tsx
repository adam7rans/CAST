import React from 'react';
import { VideoGradientSection } from '../ParamControls.gradient';
import { DEFAULT_VIDEO } from '../../lib/types';
import { createStage } from '../../lib/pipeline/registry';
import { gradientView, stageFromGradientView } from '../../lib/pipeline/gradientStage';
import type { PipelineStage } from '../../lib/pipeline/types';

/** The gradient editor, driven by a gradient pipeline stage instead of the top-level video params. */
export const GradientStagePanel: React.FC<{ stage: PipelineStage; onChange: (stage: PipelineStage) => void }> = ({ stage, onChange }) => (
  <VideoGradientSection
    value={gradientView(DEFAULT_VIDEO, stage)}
    onChange={(view) => onChange(stageFromGradientView(stage, view))}
    onReset={() => onChange(createStage('gradient', { id: stage.id, enabled: stage.enabled }))}
  />
);
