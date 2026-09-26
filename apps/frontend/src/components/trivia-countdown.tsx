import styles from "./trivia-countdown.module.css";

const URGENT_THRESHOLD_SECONDS = 5;

export function TriviaCountdown({ seconds }: { seconds: number }) {
  const urgent = seconds <= URGENT_THRESHOLD_SECONDS;

  return (
    <p className={`${styles.countdown} ${urgent ? styles.urgent : ""}`}>{seconds}</p>
  );
}
