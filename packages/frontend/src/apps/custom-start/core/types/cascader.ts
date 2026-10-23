export interface CascaderOption {
  label: string;
  value: string;
  children?: CascaderOption[];
  disabled?: boolean;
}
