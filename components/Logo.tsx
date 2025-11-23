import Link from 'next/link'
import Image from 'next/image'

interface LogoProps {
  href?: string
  className?: string
}

export default function Logo({ href = '/dashboard', className = 'h-8 w-auto' }: LogoProps) {
  return (
    <Link href={href} className="block">
      <img
        src="https://res.cloudinary.com/njh101010/image/upload/v1760889858/anygym/anygym.png"
        alt="anygym"
        className={className}
      />
    </Link>
  )
}

