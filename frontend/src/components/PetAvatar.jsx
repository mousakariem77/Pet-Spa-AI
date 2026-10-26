import { Avatar } from 'antd'

export const getPetAvatarUrl = (species) => {
  return species === 'cat' ? '/avatars/cat.svg' : '/avatars/dog.svg'
}

/**
 * Component hiển thị avatar mặc định đồng bộ cho thú cưng (chó / mèo).
 * - species: 'dog' | 'cat'
 * - size: kích thước px (mặc định 40)
 * - shape: 'circle' | 'square' (mặc định circle)
 */
export default function PetAvatar({
  species = 'dog',
  size = 40,
  shape = 'circle',
  style,
  className,
  alt,
  ...props
}) {
  const avatarUrl = getPetAvatarUrl(species)
  const isCat = species === 'cat'
  const defaultAlt = isCat ? 'Avatar Mèo' : 'Avatar Chó'

  return (
    <Avatar
      src={avatarUrl}
      size={size}
      shape={shape}
      alt={alt || defaultAlt}
      className={className}
      style={{
        backgroundColor: '#0f8b8d',
        border: '1.5px solid rgba(255, 255, 255, 0.9)',
        boxShadow: '0 2px 6px rgba(15, 139, 141, 0.25)',
        flexShrink: 0,
        ...style,
      }}
      {...props}
    />
  )
}
