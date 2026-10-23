import { FC, ReactNode } from 'react';
import styles from './Card.module.scss';

export interface CardProps {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  quality?: string; // 品质：用于特殊样式
}

/**
 * 卡片容器组件
 */
export const Card: FC<CardProps> = ({
  title,
  children,
  className = '',
  bodyClassName = '',
  quality,
}) => {
  const qualityClass = quality
    ? styles[`cardQuality${quality.charAt(0).toUpperCase() + quality.slice(1)}`]
    : '';

  return (
    <div className={`${styles.card} ${qualityClass} ${className}`}>
      {title && <div className={styles.cardHeader}>{title}</div>}
      <div
        className={`${styles.cardBody} ${!title ? styles.cardBodyStandalone : ''} ${bodyClassName}`}
      >
        {children}
      </div>
    </div>
  );
};
