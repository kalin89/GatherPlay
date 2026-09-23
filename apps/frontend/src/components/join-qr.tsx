import QRCode from "react-qr-code";
import styles from "./join-qr.module.css";

export function JoinQr({ url }: { url: string }) {
  return (
    <div className={styles.wrapper}>
      <QRCode
        value={url}
        className={styles.code}
        style={{ width: "100%", height: "auto" }}
        level="M"
      />
    </div>
  );
}
