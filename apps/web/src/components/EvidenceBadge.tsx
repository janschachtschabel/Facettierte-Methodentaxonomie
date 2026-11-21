import type { EvidenceGrade } from '@fmt/core';

const TITLES: Record<EvidenceGrade, string> = {
  A: 'Evidenzgrad A: Mindestens zwei unabhängige Synthesen mit gleichgerichtetem Befund',
  B: 'Evidenzgrad B: Eine Meta-Analyse, Forschungsprogramm oder stark heterogene Befunde',
  C: 'Evidenzgrad C: Einzelstudien, Theorie oder Praxistradition (vorläufig)'
};

export function EvidenceBadge({ grade }: { grade: EvidenceGrade | null }) {
  if (!grade) {
    return (
      <span className="status-badge" title="Kein Wirksamkeitsbeleg">
        –
      </span>
    );
  }
  return (
    <span className={`grade g${grade}`} title={TITLES[grade]} aria-label={TITLES[grade]}>
      {grade}
    </span>
  );
}
