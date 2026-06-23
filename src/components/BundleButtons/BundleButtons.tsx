import { BUNDLES } from "@/types/ticket";
import styles from "./BundleButtons.module.css";

type BundleButtonsProps = {
  onAdd: (count: number) => void;
  disabled?: boolean;
};

const THEME_CLASS = {
  green: styles.bundleButton_themeGreen,
  blue: styles.bundleButton_themeBlue,
  magenta: styles.bundleButton_themeMagenta,
  gold: styles.bundleButton_themeGold,
} as const;

function TicketStackIcon() {
  return (
    <svg viewBox="0 0 48 32" className={styles.bundleIcon} aria-hidden>
      <rect
        x="4"
        y="8"
        width="28"
        height="18"
        rx="3"
        fill="#fbbf24"
        stroke="#d97706"
        strokeWidth="1"
        transform="rotate(-12 18 17)"
      />
      <rect
        x="10"
        y="6"
        width="28"
        height="18"
        rx="3"
        fill="#fcd34d"
        stroke="#f59e0b"
        strokeWidth="1"
        transform="rotate(-4 24 15)"
      />
      <rect
        x="16"
        y="4"
        width="28"
        height="18"
        rx="3"
        fill="#fde68a"
        stroke="#fbbf24"
        strokeWidth="1"
      />
      {[22, 28, 34, 40].map((cx) => (
        <circle key={cx} cx={cx} cy="13" r="2.5" fill="#f59e0b" opacity="0.7" />
      ))}
    </svg>
  );
}

export function BundleButtons({ onAdd, disabled }: BundleButtonsProps) {
  return (
    <div className={styles.bundleGrid}>
      {BUNDLES.map((bundle) => (
        <button
          key={bundle.count}
          type="button"
          disabled={disabled}
          onClick={() => onAdd(bundle.count)}
          className={`${styles.bundleButton} ${THEME_CLASS[bundle.theme]}`}
          aria-label={`Add ${bundle.count} tickets for ${bundle.price}`}
        >
          <div className={styles.bundleButton__shine} aria-hidden />
          <div className={styles.bundleButton__top}>
            <TicketStackIcon />
            <span className={styles.bundleButton__count}>+{bundle.count}</span>
          </div>
          <div className={styles.bundleButton__platform}>
            <span className={styles.bundleButton__price}>{bundle.price}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
