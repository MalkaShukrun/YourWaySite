// The design's icon style; pass the size alongside: <MapPin {...iconProps} size={20} />
export const iconProps = { className: "icon", strokeWidth: 1.8 } as const;
// Cars face left — the direction of travel in RTL.
export const carIconProps = { ...iconProps, className: "icon car-icon" } as const;
