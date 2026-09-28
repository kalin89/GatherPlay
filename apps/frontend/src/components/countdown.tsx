import styles from "./countdown.module.css";

const URGENT_THRESHOLD_SECONDS = 5;

export function Countdown({ seconds }: { seconds: number }) {
  const urgent = seconds <= URGENT_THRESHOLD_SECONDS;

  return (
    <p className={`${styles.countdown} ${urgent ? styles.urgent : ""}`}>{seconds}</p>
  );
}
