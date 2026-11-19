import { BrowserIcon, Key01Icon, ServerStack01Icon, ShieldKeyIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import type { ReactNode } from 'react';

import { serverRequestFlow as flow } from '@/lib/server-request-flow';

import styles from './request-flow.module.css';

function FlowIcon({ icon }: { icon: IconSvgElement }) {
  return (
    <span className={styles.icon} aria-hidden="true">
      <HugeiconsIcon icon={icon} size={21} strokeWidth={1.8} />
    </span>
  );
}

function Signer({
  icon,
  title,
  method,
  signing,
  children,
}: {
  icon: IconSvgElement;
  title: string;
  method: string;
  signing: 'shared-secret' | 'public-key';
  children: ReactNode;
}) {
  return (
    <div className={styles.signer} data-signing={signing}>
      <FlowIcon icon={icon} />
      <p>
        <strong>{title}</strong>
        <span className={styles.detail}>({method})</span>
      </p>
      <p>{children}</p>
    </div>
  );
}

export function ServerRequestFlow() {
  const { sharedSecret, publicKey, browser, cloudpdf, handoff } = flow;

  return (
    <figure className={styles.figure} aria-label={flow.label}>
      <div className={styles.diagram}>
        <div className={styles.signing}>
          <Signer
            icon={Key01Icon}
            title={sharedSecret.title}
            method={sharedSecret.method}
            signing="shared-secret"
          >
            {sharedSecret.lead}
            <a href={sharedSecret.action.href}>{sharedSecret.action.label}</a>
            {sharedSecret.end}
          </Signer>
          <div className={styles.choice}>
            <p>or</p>
          </div>
          <Signer
            icon={ShieldKeyIcon}
            title={publicKey.title}
            method={publicKey.method}
            signing="public-key"
          >
            {publicKey.description}
          </Signer>
        </div>
        <div className={styles.join} aria-hidden="true" />
        <div className={styles.handoff}>
          <p>
            {handoff.lead}
            <strong>{handoff.token}</strong>.
          </p>
        </div>
        <div className={styles.flow}>
          <div className={styles.node}>
            <FlowIcon icon={BrowserIcon} />
            <p>
              <strong>{browser.title}</strong>
              <span className={styles.detail}>
                <a href={browser.engine.href}>
                  <code>{browser.engine.name}</code>
                </a>
              </span>
            </p>
          </div>
          <div className={styles.exchange}>
            <div className={styles.request}>
              <p>{flow.request}</p>
            </div>
            <div className={styles.response}>
              <p>{flow.result}</p>
            </div>
          </div>
          <div className={styles.node}>
            <FlowIcon icon={ServerStack01Icon} />
            <p>
              <strong>{cloudpdf.title}</strong>
              <span className={styles.detail}>{cloudpdf.detail}</span>
            </p>
          </div>
        </div>
      </div>
    </figure>
  );
}
