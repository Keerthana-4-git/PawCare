import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Building2,
  CarFront,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  Filter,
  HeartHandshake,
  HeartPulse,
  Hospital,
  LocateFixed,
  Mail,
  MapPin,
  Menu,
  PawPrint,
  Phone,
  Search,
  ShieldCheck,
  Star,
  Stethoscope,
  X,
} from 'lucide-react'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'

type ServiceCategory =
  | 'Veterinary Clinics'
  | 'Animal Hospitals'
  | 'Boarding Facilities'
  | 'Diagnostics'
  | 'Animal Ambulances'
  | 'Animal NGOs'

type AvailabilityFilter = 'Any' | 'Open now' | 'Available Today' | 'Open 24/7'

type Provider = {
  id: number
  name: string
  category: ServiceCategory
  location: string
  address: string
  rating: number
  reviewCount: number
  description: string
  image: string
  phone: string
  hours: string
  availability: Exclude<AvailabilityFilter, 'Any'> | null
  services: string[]
  email?: string
  contactPerson?: string
  isUserSubmitted?: boolean
  imageInDatabase?: boolean
}

type BusinessForm = {
  businessName: string
  category: ServiceCategory
  location: string
  contactPerson: string
  phone: string
  email: string
  services: string
}

type AuthUser = { name: string; email: string }
type StoredAccount = AuthUser & { password: string }
type ProviderStoreValue = {
  providers: Provider[]
  storageError: string
  addProvider: (form: BusinessForm, image?: Blob) => Promise<Provider>
  updateProvider: (id: number, form: BusinessForm, image?: Blob) => Promise<Provider>
  deleteProvider: (id: number) => Promise<void>
}

const USERS_STORAGE_KEY = 'pawcare.users'
const SESSION_STORAGE_KEY = 'pawcare.session'
const PROVIDERS_STORAGE_KEY = 'pawcare.providers'
const BUSINESS_SUBMISSIONS_STORAGE_KEY = 'pawcare.businessSubmissions'
const PROVIDER_IMAGE_DB = 'pawcare-provider-images'
const PROVIDER_IMAGE_STORE = 'images'
const DEFAULT_PROVIDER_IMAGE =
  'https://images.unsplash.com/photo-1537151625747-768eb6cf92b2?auto=format&fit=crop&w=900&q=80'
const ProviderStoreContext = createContext<ProviderStoreValue | null>(null)

function openProviderImageDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(PROVIDER_IMAGE_DB, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PROVIDER_IMAGE_STORE)) {
        request.result.createObjectStore(PROVIDER_IMAGE_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open image storage.'))
  })
}

async function saveProviderImage(id: number, image: Blob) {
  const database = await openProviderImageDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PROVIDER_IMAGE_STORE, 'readwrite')
    transaction.objectStore(PROVIDER_IMAGE_STORE).put(image, id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save provider image.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Provider image save was aborted.'))
  }).finally(() => database.close())
}

async function getProviderImage(id: number) {
  const database = await openProviderImageDatabase()
  return new Promise<Blob | undefined>((resolve, reject) => {
    const transaction = database.transaction(PROVIDER_IMAGE_STORE, 'readonly')
    const request = transaction.objectStore(PROVIDER_IMAGE_STORE).get(id)
    request.onsuccess = () => resolve(request.result as Blob | undefined)
    request.onerror = () => reject(request.error ?? new Error('Could not read provider image.'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => database.close()
  })
}

async function deleteProviderImage(id: number) {
  const database = await openProviderImageDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PROVIDER_IMAGE_STORE, 'readwrite')
    transaction.objectStore(PROVIDER_IMAGE_STORE).delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not remove provider image.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Provider image removal was aborted.'))
  }).finally(() => database.close())
}

async function compressProviderImage(file: File) {
  const bitmap = await createImageBitmap(file)
  const maxDimension = 1400
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Image processing is unavailable in this browser.')
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process this image.'))),
      'image/webp',
      0.82,
    )
  })
}

function readSession(): AuthUser | null {
  const storedSession = localStorage.getItem(SESSION_STORAGE_KEY)
  if (!storedSession) return null

  try {
    const user = JSON.parse(storedSession) as Partial<AuthUser>
    return typeof user.name === 'string' && typeof user.email === 'string'
      ? { name: user.name, email: user.email }
      : null
  } catch (error) {
    console.error('Unable to read the PawCare demo session.', error)
    return null
  }
}

function appendLocalSubmission(storageKey: string, value: Record<string, string>) {
  const existing = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown
  if (!Array.isArray(existing)) {
    throw new Error('Stored submissions are not in the expected format.')
  }
  localStorage.setItem(
    storageKey,
    JSON.stringify([...existing, { ...value, submittedAt: new Date().toISOString() }]),
  )
}

const serviceOrder: ServiceCategory[] = [
  'Veterinary Clinics',
  'Animal Hospitals',
  'Boarding Facilities',
  'Diagnostics',
  'Animal Ambulances',
  'Animal NGOs',
]

const serviceMeta: Record<
  ServiceCategory,
  { icon: typeof Stethoscope; accent: string; description: string }
> = {
  'Veterinary Clinics': {
    icon: Stethoscope,
    accent: 'bg-[#EAF2E9] text-[#244B38]',
    description: 'Primary care, preventive checkups and compassionate treatment plans.',
  },
  'Animal Hospitals': {
    icon: Hospital,
    accent: 'bg-[#EAF2E9] text-[#315D45]',
    description: 'Advanced care, emergency response and specialist-led recovery support.',
  },
  'Boarding Facilities': {
    icon: Building2,
    accent: 'bg-[#F6F2E9] text-[#8A6A3D]',
    description: 'Comfortable overnight stays with enrichment and trusted routines.',
  },
  Diagnostics: {
    icon: HeartPulse,
    accent: 'bg-[#E9F6F0] text-[#265C4D]',
    description: 'Scans, lab tests and health screening to keep pets ahead of issues.',
  },
  'Animal Ambulances': {
    icon: CarFront,
    accent: 'bg-[#EAF2E9] text-[#244B38]',
    description: 'Rapid transport and emergency support when your pet needs immediate care.',
  },
  'Animal NGOs': {
    icon: HeartHandshake,
    accent: 'bg-[#EEF4FF] text-[#3C5BA6]',
    description: 'Rescue support, adoption guidance and community care services.',
  },
}

const providers: Provider[] = [
  {
    id: 1,
    name: 'GreenPaws Veterinary Care',
    category: 'Veterinary Clinics',
    location: 'Bengaluru',
    address: '18 Palm Grove, Koramangala, Bengaluru',
    rating: 4.9,
    reviewCount: 184,
    description: 'Family-focused veterinary care with wellness plans and personalized treatment for cats and dogs.',
    image:
      'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=900&q=80',
    phone: '+91 98765 43210',
    hours: 'Mon-Sat • 9:00 AM - 8:00 PM',
    availability: 'Open now',
    services: ['Vaccination', 'Dental Care', 'General Consultation'],
  },
  {
    id: 2,
    name: 'Harbor Animal Hospital',
    category: 'Animal Hospitals',
    location: 'Bengaluru',
    address: '42 Lake View Road, Indiranagar, Bengaluru',
    rating: 4.8,
    reviewCount: 162,
    description: 'Advanced surgical and emergency care for pets in a calm, modern clinical setting.',
    image:
      'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=900&q=80',
    phone: '+91 99887 11223',
    hours: 'Open 24/7',
    availability: 'Open 24/7',
    services: ['Emergency Care', 'Surgery', 'Critical Monitoring'],
  },
  {
    id: 3,
    name: 'CozyNest Pet Boarding',
    category: 'Boarding Facilities',
    location: 'Hitech City',
    address: '9 Serenity Terrace, Hitech City, Hyderabad',
    rating: 4.7,
    reviewCount: 91,
    description: 'A safe, thoughtfully designed boarding experience with enrichment and daily updates.',
    image:
      'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=900&q=80',
    phone: '+91 91234 56789',
    hours: 'Mon-Sun • 7:00 AM - 9:00 PM',
    availability: 'Available Today',
    services: ['Boarding', 'Day Care', 'Playtime'],
  },
  {
    id: 4,
    name: 'PetScan Diagnostics',
    category: 'Diagnostics',
    location: 'Whitefield',
    address: '102 Orchid Lane, Whitefield, Bengaluru',
    rating: 4.6,
    reviewCount: 134,
    description: 'Accurate lab work and imaging services delivered with quick turnaround and caring support.',
    image:
      'https://images.unsplash.com/photo-1534361960057-19889db9621e?auto=format&fit=crop&w=900&q=80',
    phone: '+91 90210 77889',
    hours: 'Mon-Sat • 8:00 AM - 7:00 PM',
    availability: 'Open now',
    services: ['Blood Tests', 'X-rays', 'Ultrasounds'],
  },
  {
    id: 5,
    name: 'SwiftPaw Rescue & Care',
    category: 'Animal NGOs',
    location: 'Koramangala',
    address: '7 Hope Lane, Koramangala, Bengaluru',
    rating: 4.9,
    reviewCount: 108,
    description: 'Community-focused rescue and adoption support helping pets find safer, kinder homes.',
    image:
      'https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=900&q=80',
    phone: '+91 98876 54123',
    hours: 'Tue-Sun • 10:00 AM - 5:00 PM',
    availability: 'Available Today',
    services: ['Adoption', 'Rescue Transport', 'Community Clinics'],
  },
  {
    id: 6,
    name: 'Ranger Rescue Service',
    category: 'Animal Ambulances',
    location: 'MG Road',
    address: '55 City Centre, MG Road, Bengaluru',
    rating: 4.8,
    reviewCount: 76,
    description: 'Rapid-response ambulance care with trained handlers for safe transfers and urgent care.',
    image:
      'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=900&q=80',
    phone: '+91 91111 10022',
    hours: 'Open 24/7',
    availability: 'Open 24/7',
    services: ['Emergency Transfer', 'Critical Transport', 'On-site Stabilization'],
  },
  {
    id: 7,
    name: 'Paws & Whiskers Clinic',
    category: 'Veterinary Clinics',
    location: 'Jayanagar',
    address: '13 Orchard Court, Jayanagar, Bengaluru',
    rating: 4.7,
    reviewCount: 143,
    description: 'Warm, approachable animal care helping pet parents make confident, long-term health decisions.',
    image:
      'https://images.unsplash.com/photo-1583511655826-05700d52f4d9?auto=format&fit=crop&w=900&q=80',
    phone: '+91 98123 11244',
    hours: 'Mon-Sat • 9:00 AM - 7:30 PM',
    availability: 'Open now',
    services: ['Wellness Exams', 'Vaccination', 'Nutrition Advice'],
  },
  {
    id: 8,
    name: 'Paw Haven Veterinary Centre',
    category: 'Animal Hospitals',
    location: 'Electronic City',
    address: '28 Kaveri Heights, Electronic City, Bengaluru',
    rating: 4.5,
    reviewCount: 88,
    description: 'Comprehensive hospital-level care with wellness plans, diagnostics and compassionate handholding.',
    image:
      'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=900&q=80',
    phone: '+91 92000 33111',
    hours: 'Mon-Sun • 8:00 AM - 9:00 PM',
    availability: 'Available Today',
    services: ['Preventive Care', 'Hospitalization', 'Post-op Care'],
  },
]

function getDuplicateKey(name: string, location: string, category: string) {
  return [name, location, category].map((value) => value.trim().toLocaleLowerCase()).join('|')
}

function getLegacyProviderId(identity: string) {
  let hash = 2166136261
  for (const character of identity) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  }
  return 1_000_000_000 + (hash >>> 0)
}

function isServiceCategory(value: unknown): value is ServiceCategory {
  return typeof value === 'string' && serviceOrder.includes(value as ServiceCategory)
}

function readProviderStore(): { providers: Provider[]; error: string } {
  try {
    const storedProviders = JSON.parse(localStorage.getItem(PROVIDERS_STORAGE_KEY) ?? '[]') as unknown
    const oldSubmissions = JSON.parse(localStorage.getItem(BUSINESS_SUBMISSIONS_STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(storedProviders) || !Array.isArray(oldSubmissions)) {
      throw new Error('Stored provider data is not in the expected format.')
    }
    const storedProviderRecords: unknown[] = storedProviders
    const oldSubmissionRecords: unknown[] = oldSubmissions

    const registered: Provider[] = storedProviderRecords.filter(
      (provider): provider is Provider =>
        typeof provider === 'object' &&
        provider !== null &&
        'isUserSubmitted' in provider &&
        provider.isUserSubmitted === true &&
        'id' in provider &&
        typeof provider.id === 'number' &&
        'name' in provider &&
        typeof provider.name === 'string' &&
        'category' in provider &&
        isServiceCategory(provider.category) &&
        'location' in provider &&
        typeof provider.location === 'string' &&
        'address' in provider &&
        typeof provider.address === 'string' &&
        'phone' in provider &&
        typeof provider.phone === 'string' &&
        'services' in provider &&
        Array.isArray(provider.services),
    )
    const knownKeys = new Set(
      [...providers, ...registered].map((provider) =>
        getDuplicateKey(provider.name, provider.location, provider.category),
      ),
    )

    oldSubmissionRecords.forEach((submission, index) => {
      if (
        typeof submission !== 'object' ||
        submission === null ||
        !('businessName' in submission) ||
        typeof submission.businessName !== 'string' ||
        !('category' in submission) ||
        !isServiceCategory(submission.category) ||
        !('location' in submission) ||
        typeof submission.location !== 'string' ||
        !('phone' in submission) ||
        typeof submission.phone !== 'string' ||
        !('email' in submission) ||
        typeof submission.email !== 'string' ||
        !('services' in submission) ||
        typeof submission.services !== 'string'
      ) {
        return
      }

      const key = getDuplicateKey(submission.businessName, submission.location, submission.category)
      if (knownKeys.has(key)) return

      const submittedAt =
        'submittedAt' in submission && typeof submission.submittedAt === 'string'
          ? submission.submittedAt
          : ''
      const id = getLegacyProviderId(
        `${submission.businessName}|${submission.location}|${submission.category}|${submittedAt}|${index}`,
      )
      registered.push({
        id,
        name: submission.businessName,
        category: submission.category,
        location: submission.location,
        address: submission.location,
        rating: 0,
        reviewCount: 0,
        description: 'User-submitted demo listing. Contact the business directly for details.',
        image:
          'https://images.unsplash.com/photo-1537151625747-768eb6cf92b2?auto=format&fit=crop&w=900&q=80',
        phone: submission.phone,
        email: submission.email,
        contactPerson:
          'contactPerson' in submission && typeof submission.contactPerson === 'string'
            ? submission.contactPerson
            : '',
        hours: 'Contact provider for hours',
        availability: null,
        services: submission.services.split(/[,\n]/).map((service) => service.trim()).filter(Boolean),
        isUserSubmitted: true,
      })
      knownKeys.add(key)
    })

    return { providers: registered, error: '' }
  } catch (error) {
    console.error('Unable to load PawCare user-submitted providers.', error)
    return {
      providers: [],
      error: 'Saved demo listings could not be loaded from this browser. Check local storage and refresh to try again.',
    }
  }
}

function useProviderStore() {
  const store = useContext(ProviderStoreContext)
  if (!store) throw new Error('ProviderStoreContext is not available.')
  return store
}

const navItems = ['Home', 'Services', 'About Us', 'Contact']

function App() {
  return (
    <ProviderStore>
      <BrowserRouter>
        <ScrollToTop />
        <AppShell />
      </BrowserRouter>
    </ProviderStore>
  )
}

function ProviderStore({ children }: { children: React.ReactNode }) {
  const [storedProviders, setStoredProviders] = useState(readProviderStore)
  const allProviders = useMemo(
    () => [...providers, ...storedProviders.providers],
    [storedProviders.providers],
  )

  useEffect(() => {
    let active = true
    const providersNeedingImages = storedProviders.providers.filter(
      (provider) => provider.imageInDatabase && !provider.image.startsWith('blob:'),
    )
    if (providersNeedingImages.length === 0) return

    Promise.all(
      providersNeedingImages.map(async (provider) => {
        const blob = await getProviderImage(provider.id)
        return { id: provider.id, image: blob ? URL.createObjectURL(blob) : DEFAULT_PROVIDER_IMAGE }
      }),
    )
      .then((images) => {
        if (!active) {
          images.forEach(({ image }) => {
            if (image.startsWith('blob:')) URL.revokeObjectURL(image)
          })
          return
        }
        const imageById = new Map(images.map(({ id, image }) => [id, image]))
        setStoredProviders((current) => ({
          ...current,
          providers: current.providers.map((provider) => ({
            ...provider,
            image: imageById.get(provider.id) ?? provider.image,
          })),
        }))
      })
      .catch((error: unknown) => {
        console.error('Unable to load stored PawCare provider images.', error)
        if (active) {
          setStoredProviders((current) => ({
            ...current,
            error: 'Some saved provider images could not be loaded from browser storage.',
          }))
        }
      })

    return () => {
      active = false
    }
  }, [storedProviders.providers])

  const persistProviders = (nextProviders: Provider[]) => {
    const storageProviders = nextProviders.map((provider) => ({
      ...provider,
      image: DEFAULT_PROVIDER_IMAGE,
    }))
    try {
      localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify(storageProviders))
    } catch (error) {
      console.error('Unable to save PawCare user-submitted providers.', error)
      throw new Error('We could not save this listing in your browser. Check storage availability and try again.')
    }
  }

  const addProvider = async (form: BusinessForm, image?: Blob) => {
    const duplicate = allProviders.some(
      (provider) =>
        getDuplicateKey(provider.name, provider.location, provider.category) ===
        getDuplicateKey(form.businessName, form.location, form.category),
    )
    if (duplicate) {
      throw new Error('A listing with this business name, location and category already exists.')
    }

    let id = Date.now()
    while (allProviders.some((provider) => provider.id === id)) id += 1
    if (image) await saveProviderImage(id, image)
    const registeredProvider: Provider = {
      id,
      name: form.businessName.trim(),
      category: form.category,
      location: form.location.trim(),
      address: form.location.trim(),
      rating: 0,
      reviewCount: 0,
      description: 'User-submitted demo listing. Contact the business directly for details.',
      image: image ? URL.createObjectURL(image) : DEFAULT_PROVIDER_IMAGE,
      phone: form.phone.trim(),
      email: form.email.trim(),
      contactPerson: form.contactPerson.trim(),
      hours: 'Contact provider for hours',
      availability: null,
      services: form.services.split(/[,\n]/).map((service) => service.trim()).filter(Boolean),
      isUserSubmitted: true,
      imageInDatabase: Boolean(image),
    }

    const nextProviders = [...storedProviders.providers, registeredProvider]
    try {
      persistProviders(nextProviders)
    } catch (error) {
      if (image) await deleteProviderImage(id)
      throw error
    }
    setStoredProviders({ providers: nextProviders, error: '' })
    return registeredProvider
  }

  const updateProvider = async (id: number, form: BusinessForm, image?: Blob) => {
    const existing = storedProviders.providers.find((provider) => provider.id === id)
    if (!existing) throw new Error('This user-submitted listing is no longer available.')
    const duplicate = allProviders.some(
      (provider) =>
        provider.id !== id &&
        getDuplicateKey(provider.name, provider.location, provider.category) ===
          getDuplicateKey(form.businessName, form.location, form.category),
    )
    if (duplicate) {
      throw new Error('A listing with this business name, location and category already exists.')
    }

    if (image) await saveProviderImage(id, image)
    const updatedProvider: Provider = {
      ...existing,
      name: form.businessName.trim(),
      category: form.category,
      location: form.location.trim(),
      address: form.location.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      contactPerson: form.contactPerson.trim(),
      services: form.services.split(/[,\n]/).map((service) => service.trim()).filter(Boolean),
      image: image ? URL.createObjectURL(image) : existing.image,
      imageInDatabase: image ? true : existing.imageInDatabase,
    }
    const nextProviders = storedProviders.providers.map((provider) =>
      provider.id === id ? updatedProvider : provider,
    )
    persistProviders(nextProviders)
    setStoredProviders({ providers: nextProviders, error: '' })
    if (image && existing.image.startsWith('blob:')) URL.revokeObjectURL(existing.image)
    return updatedProvider
  }

  const deleteProvider = async (id: number) => {
    const existing = storedProviders.providers.find((provider) => provider.id === id)
    if (!existing) throw new Error('This user-submitted listing is no longer available.')
    const nextProviders = storedProviders.providers.filter((provider) => provider.id !== id)
    persistProviders(nextProviders)
    setStoredProviders({ providers: nextProviders, error: '' })
    if (existing.image.startsWith('blob:')) URL.revokeObjectURL(existing.image)
    if (existing.imageInDatabase) {
      try {
        await deleteProviderImage(id)
      } catch (error) {
        console.error('Unable to remove a deleted PawCare provider image.', error)
        setStoredProviders((current) => ({
          ...current,
          error: 'The listing was removed, but its stored image could not be cleared.',
        }))
      }
    }
  }

  const value = {
    providers: allProviders,
    storageError: storedProviders.error,
    addProvider,
    updateProvider,
    deleteProvider,
  }

  return <ProviderStoreContext.Provider value={value}>{children}</ProviderStoreContext.Provider>
}

function ScrollToTop() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.key])

  return null
}

function AppShell() {
  const { storageError, addProvider, updateProvider, deleteProvider } = useProviderStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(readSession)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [businessFormOpen, setBusinessFormOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [providerToDelete, setProviderToDelete] = useState<Provider | null>(null)
  const [providerActionError, setProviderActionError] = useState('')
  const [activeSection, setActiveSection] = useState('home')
  const [authNotice, setAuthNotice] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  const createBusiness = () => {
    setEditingProvider(null)
    setProviderActionError('')
    setBusinessFormOpen(true)
  }

  const editBusiness = (provider: Provider) => {
    if (!provider.isUserSubmitted) return
    setEditingProvider(provider)
    setProviderActionError('')
    setBusinessFormOpen(true)
  }

  const confirmDeleteBusiness = async () => {
    if (!providerToDelete?.isUserSubmitted) return
    try {
      await deleteProvider(providerToDelete.id)
      setProviderToDelete(null)
      setProviderActionError('')
      if (location.pathname === `/provider/${providerToDelete.id}`) navigate('/search')
    } catch (error) {
      console.error('Unable to delete PawCare user-submitted listing.', error)
      setProviderActionError(
        error instanceof Error ? error.message : 'The listing could not be deleted. Try again.',
      )
    }
  }

  const handleBusinessSubmit = async (form: BusinessForm, image?: Blob) => {
    return editingProvider
      ? await updateProvider(editingProvider.id, form, image)
      : await addProvider(form, image)
  }

  useEffect(() => {
    const openCorrection = () => setCorrectionOpen(true)
    window.addEventListener('pawcare:open-correction', openCorrection)
    return () => window.removeEventListener('pawcare:open-correction', openCorrection)
  }, [])

  useEffect(() => {
    if (location.pathname !== '/') return

    const observer = new IntersectionObserver(
      (entries) => {
        const activeEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (activeEntry) setActiveSection(activeEntry.target.id)
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )
    navItems.forEach((item) => {
      const section = document.getElementById(item.toLowerCase().replace(/\s+/g, '-'))
      if (section) observer.observe(section)
    })
    return () => observer.disconnect()
  }, [location.pathname])

  const handleSectionNavigate = (sectionId: string) => {
    setMobileMenuOpen(false)
    if (location.pathname !== '/') {
      navigate('/')
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
      return
    }

    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const logout = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    setCurrentUser(null)
    setAuthNotice('')
    setMobileMenuOpen(false)
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-cream text-charcoal">
      <header className="sticky top-0 z-40 border-b border-[#EAF2E9] bg-[#FAF8F2]/90 backdrop-blur-md">
        <div className="section-shell flex items-center justify-between py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white shadow-soft">
              <PawPrint className="h-5 w-5" />
            </span>
            <span className="text-xl font-extrabold tracking-tight text-charcoal">PawCare</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {navItems.map((item) => {
              const id = item.toLowerCase().replace(/\s+/g, '-')
              const isActive = location.pathname === '/' && activeSection === id

              return (
                <button
                  key={item}
                  type="button"
                  className={`nav-link ${isActive ? 'text-primary' : ''}`}
                  onClick={() => handleSectionNavigate(id)}
                >
                  {item}
                </button>
              )
            })}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            {currentUser ? (
              <>
                <span className="text-sm font-semibold text-charcoal">Hi, {currentUser.name}</span>
                <button type="button" className="secondary-btn" onClick={logout}>Logout</button>
              </>
            ) : (
              <>
                <Link to="/login" className="secondary-btn">Login</Link>
                <Link to="/signup" className="brand-btn">Sign Up</Link>
              </>
            )}
          </div>

          <button
            type="button"
            aria-label="Toggle navigation menu"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[#D8E4D9] bg-white md:hidden"
            onClick={() => setMobileMenuOpen((current) => !current)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <AnimatePresence>
          {mobileMenuOpen ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-t border-[#EAF2E9] bg-white md:hidden"
            >
              <div className="section-shell flex flex-col gap-4 py-4">
                {navItems.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="nav-link flex items-center justify-between rounded-xl px-2 py-2 hover:bg-[#F5F9F6]"
                    onClick={() => handleSectionNavigate(item.toLowerCase().replace(/\s+/g, '-'))}
                  >
                    <span>{item}</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ))}
                <div className="mt-2 flex gap-3">
                  {currentUser ? (
                    <button type="button" className="secondary-btn flex-1" onClick={logout}>Logout</button>
                  ) : (
                    <>
                      <Link to="/login" className="secondary-btn flex-1" onClick={() => setMobileMenuOpen(false)}>Login</Link>
                      <Link to="/signup" className="brand-btn flex-1" onClick={() => setMobileMenuOpen(false)}>Sign Up</Link>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>

      <main>
        {storageError ? (
          <div className="section-shell pt-5">
            <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {storageError}
            </p>
          </div>
        ) : null}
        {authNotice ? (
          <div role="status" className="section-shell pt-5">
            <p className="rounded-2xl border border-[#D8E4D9] bg-[#F5F9F5] px-4 py-3 text-sm font-semibold text-primary">
              {authNotice}
            </p>
          </div>
        ) : null}
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                onCreateBusiness={createBusiness}
                onEditProvider={editBusiness}
                onDeleteProvider={setProviderToDelete}
              />
            }
          />
          <Route
            path="/search"
            element={
              <SearchPage
                key={location.key}
                onEditProvider={editBusiness}
                onDeleteProvider={setProviderToDelete}
              />
            }
          />
          <Route
            path="/provider/:id"
            element={
              <ProviderDetailsPage
                onEditProvider={editBusiness}
                onDeleteProvider={setProviderToDelete}
              />
            }
          />
          <Route
            path="/login"
            element={
              <AuthPage
                mode="login"
                onAuthenticated={(user) => {
                  setCurrentUser(user)
                  setAuthNotice('Login successful. Welcome back.')
                  window.setTimeout(() => setAuthNotice(''), 5000)
                }}
              />
            }
          />
          <Route
            path="/signup"
            element={
              <AuthPage
                mode="signup"
                onAuthenticated={(user) => {
                  setCurrentUser(user)
                  setAuthNotice('Your account has been created and you are signed in.')
                  window.setTimeout(() => setAuthNotice(''), 5000)
                }}
              />
            }
          />
          <Route
            path="*"
            element={
              <HomePage
                onCreateBusiness={createBusiness}
                onEditProvider={editBusiness}
                onDeleteProvider={setProviderToDelete}
              />
            }
          />
        </Routes>
      </main>

      <footer id="contact" className="mt-24 border-t border-[#EAF2E9] bg-white/60">
        <div className="section-shell grid gap-10 py-12 md:grid-cols-5">
          <div className="md:col-span-2">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white shadow-soft">
                <PawPrint className="h-5 w-5" />
              </span>
              <span className="text-xl font-extrabold tracking-tight text-charcoal">PawCare</span>
            </div>
            <p className="max-w-md text-sm leading-7 text-charcoal/75">
              Helping pet parents discover trusted services, compassionate specialists and local support in one place.
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-sm uppercase tracking-[0.2em] text-charcoal/50">Quick Links</h3>
            <div className="space-y-3 text-sm text-charcoal/75">
              <button className="block" type="button" onClick={() => handleSectionNavigate('home')}>
                Home
              </button>
              <button className="block" type="button" onClick={() => handleSectionNavigate('services')}>
                Services
              </button>
              <button className="block" type="button" onClick={() => handleSectionNavigate('about-us')}>
                About Us
              </button>
              <button className="block" type="button" onClick={() => handleSectionNavigate('contact')}>
                Contact
              </button>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-sm uppercase tracking-[0.2em] text-charcoal/50">Services</h3>
            <div className="space-y-3 text-sm text-charcoal/75">
              {serviceOrder.map((service) => (
                <button
                  key={service}
                  type="button"
                  className="block"
                  onClick={() => navigate('/search', { state: { selectedCategory: service } })}
                >
                  {service}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-sm uppercase tracking-[0.2em] text-charcoal/50">Contact</h3>
            <div className="space-y-3 text-sm text-charcoal/75">
              <a href="mailto:hello@pawcare.pet" className="block hover:text-primary">hello@pawcare.pet</a>
              <a href="tel:+918000090901" className="block hover:text-primary">+91 80000 90901</a>
              <button
                type="button"
                className="inline-block text-primary hover:underline"
                onClick={() => window.dispatchEvent(new CustomEvent('pawcare:open-correction'))}
              >
                Submit a Correction
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-[#EAF2E9] py-5 text-center text-sm text-charcoal/60">
          © 2026 PawCare. All rights reserved.
        </div>
      </footer>
      {businessFormOpen ? (
        <BusinessRegistrationModal
          open={businessFormOpen}
          provider={editingProvider}
          onClose={() => {
            setBusinessFormOpen(false)
            setEditingProvider(null)
          }}
          onSubmit={handleBusinessSubmit}
        />
      ) : null}
      {providerToDelete ? (
        <ConfirmDeleteModal
          provider={providerToDelete}
          error={providerActionError}
          onCancel={() => {
            setProviderToDelete(null)
            setProviderActionError('')
          }}
          onConfirm={() => void confirmDeleteBusiness()}
        />
      ) : null}
      <CorrectionModal open={correctionOpen} onClose={() => setCorrectionOpen(false)} />
    </div>
  )
}

function AuthPage({
  mode,
  onAuthenticated,
}: {
  mode: 'login' | 'signup'
  onAuthenticated: (user: AuthUser) => void
}) {
  const navigate = useNavigate()
  const isSignup = mode === 'signup'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    const normalizedEmail = email.trim().toLowerCase()

    let accounts: StoredAccount[]
    try {
      accounts = JSON.parse(localStorage.getItem(USERS_STORAGE_KEY) ?? '[]') as StoredAccount[]
      if (!Array.isArray(accounts)) throw new Error('Stored accounts are not in the expected format.')
    } catch (error) {
      console.error('Unable to read PawCare demo accounts.', error)
      setErrorMessage('We could not read saved demo accounts. Please clear this site’s local storage and try again.')
      return
    }

    if (isSignup) {
      if (accounts.some((account) => account.email.toLowerCase() === normalizedEmail)) {
        setErrorMessage('An account with this email already exists. Please log in instead.')
        return
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.')
        return
      }

      const user = { name: name.trim(), email: normalizedEmail }
      try {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify([...accounts, { ...user, password }]))
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user))
      } catch (error) {
        console.error('Unable to save PawCare demo account.', error)
        setErrorMessage('We could not save your demo account in this browser. Check storage availability and try again.')
        return
      }
      onAuthenticated(user)
      navigate('/')
      return
    }

    const account = accounts.find(
      (item) => item.email.toLowerCase() === normalizedEmail && item.password === password,
    )
    if (!account) {
      setErrorMessage('Email or password is incorrect. Check your details or sign up for an account.')
      return
    }
    const user = { name: account.name, email: account.email }
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user))
    } catch (error) {
      console.error('Unable to save PawCare demo session.', error)
      setErrorMessage('We could not save your session in this browser. Check storage availability and try again.')
      return
    }
    onAuthenticated(user)
    navigate('/')
  }

  return (
    <section className="section-shell py-12 md:py-20">
      <div className="mx-auto max-w-xl soft-card p-6 md:p-9">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF2E9] text-primary">
            <PawPrint className="h-7 w-7" />
          </div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary/70">PawCare account</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em]">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-charcoal/65">
            {isSignup ? 'Join the community of caring pet parents.' : 'Log in to continue to PawCare.'}
          </p>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          {isSignup ? (
            <div>
              <label htmlFor="auth-name" className="mb-2 block text-sm font-semibold">Full name</label>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 outline-none focus:border-primary"
              />
            </div>
          ) : null}
          <div>
            <label htmlFor="auth-email" className="mb-2 block text-sm font-semibold">Email address</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 outline-none focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="mb-2 block text-sm font-semibold">Password</label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 pr-12 outline-none focus:border-primary"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-3 text-charcoal/60"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {isSignup ? <p className="mt-1 text-xs text-charcoal/55">Use at least 8 characters.</p> : null}
          </div>
          {isSignup ? (
            <div>
              <label htmlFor="auth-confirm-password" className="mb-2 block text-sm font-semibold">Confirm password</label>
              <div className="relative">
                <input
                  id="auth-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 pr-12 outline-none focus:border-primary"
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                  className="absolute inset-y-0 right-3 text-charcoal/60"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
          ) : null}
          {errorMessage ? (
            <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}
          <button type="submit" className="brand-btn w-full">
            {isSignup ? 'Create Account' : 'Log In'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-charcoal/65">
          {isSignup ? 'Already have an account?' : 'New to PawCare?'}{' '}
          <Link className="font-bold text-primary hover:underline" to={isSignup ? '/login' : '/signup'}>
            {isSignup ? 'Log in' : 'Sign up'}
          </Link>
        </p>
        <p className="mt-5 rounded-xl bg-[#F7FAF7] p-3 text-xs leading-5 text-charcoal/55">
          Demo only: account details are stored in this browser and are not protected by a production authentication service.
        </p>
      </div>
    </section>
  )
}

function HomePage({
  onCreateBusiness,
  onEditProvider,
  onDeleteProvider,
}: {
  onCreateBusiness: () => void
  onEditProvider: (provider: Provider) => void
  onDeleteProvider: (provider: Provider) => void
}) {
  const navigate = useNavigate()
  const { providers: allProviders } = useProviderStore()
  const [searchText, setSearchText] = useState('')
  const [locationChoice, setLocationChoice] = useState('Bengaluru')

  const handleSearch = (categoryOverride?: ServiceCategory | 'All Services') => {
    navigate('/search', {
      state: {
        selectedCategory: categoryOverride ?? 'All Services',
        searchQuery: searchText,
        location: locationChoice,
      },
    })
  }

  const featuredProviders = [
    ...allProviders.filter((provider) => !provider.isUserSubmitted).slice(0, 3),
    ...allProviders.filter((provider) => provider.isUserSubmitted),
  ]

  return (
    <>
      <section id="home" className="section-shell pb-20 pt-10 md:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#D8E4D9] bg-white px-3 py-2 text-sm font-medium text-primary shadow-sm">
              <ShieldCheck className="h-4 w-4" />
              Trusted care for every pet
            </div>
            <h1 className="max-w-xl text-5xl font-extrabold leading-[1.05] tracking-[-0.06em] text-charcoal md:text-6xl">
              Every Paw Deserves the Best Care.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-charcoal/70">
              Discover trusted veterinary clinics, hospitals and animal-care services near you.
            </p>

            <div className="mt-8 rounded-[28px] border border-[#D8E4D9] bg-white p-3 shadow-soft">
              <div className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
                <div className="rounded-2xl border border-[#EAF2E9] bg-[#F7FAF7] p-3 text-sm text-charcoal/70">
                  <label htmlFor="hero-location" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-charcoal/50">
                    Location
                  </label>
                  <select
                    id="hero-location"
                    className="w-full bg-transparent text-base font-semibold text-charcoal outline-none"
                    value={locationChoice}
                    onChange={(event) => setLocationChoice(event.target.value)}
                  >
                    <option>Bengaluru</option>
                    <option>Hyderabad</option>
                    <option>Chennai</option>
                    <option>Pune</option>
                  </select>
                </div>
                <div className="rounded-2xl border border-[#EAF2E9] bg-[#F7FAF7] p-3 text-sm text-charcoal/70">
                  <label htmlFor="hero-search" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-charcoal/50">
                    Search
                  </label>
                  <input
                    id="hero-search"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Provider, service or area"
                    className="w-full bg-transparent text-base font-medium text-charcoal placeholder:text-charcoal/40 outline-none"
                  />
                </div>
                <button type="button" className="brand-btn h-[72px] min-w-[135px]" onClick={() => handleSearch()}>
                  <Search className="h-4 w-4" />
                  Search
                </button>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <button type="button" className="brand-btn" onClick={() => handleSearch('Veterinary Clinics')}>
                Find a Vet
                <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" className="secondary-btn" onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })}>
                Explore Services
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-[32px] border border-[#DDE9DE] bg-white p-3 shadow-soft">
              <img
                src="https://images.unsplash.com/photo-1537151625747-768eb6cf92b2?auto=format&fit=crop&w=1200&q=80"
                alt="Happy dog and vet"
                className="h-[560px] w-full rounded-[26px] object-cover"
              />
            </div>
            <div className="absolute -bottom-6 left-6 rounded-2xl bg-white p-4 shadow-soft">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF2E9] text-primary">
                  <MapPin className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-charcoal/50">Nearby care</p>
                  <p className="text-lg font-extrabold text-charcoal">12 trusted providers</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="section-shell pb-20 pt-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">Services</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] md:text-4xl">
              Everything Your Pet Needs, All in One Place.
            </h2>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {serviceOrder.map((service) => {
            const meta = serviceMeta[service]
            const Icon = meta.icon

            return (
              <button
                key={service}
                type="button"
                className="soft-card group flex h-full flex-col gap-4 p-5 text-left transition hover:-translate-y-1 hover:shadow-lg"
                onClick={() => navigate('/search', { state: { selectedCategory: service } })}
              >
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${meta.accent}`}>
                  <Icon className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-extrabold tracking-[-0.04em]">{service}</h3>
                  <p className="mt-2 text-sm leading-7 text-charcoal/65">{meta.description}</p>
                </div>
                <div className="mt-auto flex items-center justify-between text-sm font-semibold text-primary">
                  <span>Explore</span>
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="section-shell pb-20">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">Featured</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] md:text-4xl">
              Trusted Animal Care Near You
            </h2>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {featuredProviders.map((provider) => (
            <article key={provider.id} className="soft-card overflow-hidden">
              <img src={provider.image} alt={provider.name} className="provider-image" />
              <div className="p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-extrabold text-charcoal">{provider.name}</h3>
                    <p className="text-sm text-charcoal/55">{provider.category}</p>
                  </div>
                  {provider.isUserSubmitted ? (
                    <span className="rounded-full bg-[#F6F2E9] px-2.5 py-1 text-xs font-bold text-[#7C633D]">
                      User-submitted demo · not verified
                    </span>
                  ) : (
                    <div className="rounded-full bg-[#F5F9F5] px-2.5 py-1 text-sm font-bold text-primary">
                      {provider.rating.toFixed(1)}
                    </div>
                  )}
                </div>

                {!provider.isUserSubmitted ? (
                  <div className="mb-3 flex items-center gap-1 text-amber-500">
                    {[...Array(5)].map((_, index) => (
                      <Star key={index} className="h-4 w-4 fill-current" />
                    ))}
                    <span className="ml-2 text-sm text-charcoal/60">({provider.reviewCount} reviews)</span>
                  </div>
                ) : null}

                <div className="mb-3 flex items-center gap-2 text-sm text-charcoal/65">
                  <MapPin className="h-4 w-4 text-primary" />
                  {provider.location}
                </div>

                <p className="mb-4 text-sm leading-7 text-charcoal/70">{provider.description}</p>
                {provider.isUserSubmitted ? (
                  <p className="mb-3 rounded-xl bg-[#F6F2E9] px-3 py-2 text-xs font-semibold text-[#6D5735]">
                    User-submitted demo listing · not verified
                  </p>
                ) : null}

                <div className="mb-4 flex items-center gap-2 text-sm text-charcoal/65">
                  <Phone className="h-4 w-4 text-primary" />
                  {provider.phone}
                </div>

                <button type="button" className="brand-btn w-full" onClick={() => navigate(`/provider/${provider.id}`)}>
                  View Details
                </button>
                {provider.isUserSubmitted ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="secondary-btn flex-1" onClick={() => onEditProvider(provider)}>Edit</button>
                    <button type="button" className="secondary-btn flex-1 text-red-700 hover:border-red-300 hover:text-red-700" onClick={() => onDeleteProvider(provider)}>Delete</button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[#EEF5EF] py-20">
        <div className="section-shell">
          <div className="mb-12 text-center">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">Why PawCare</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] md:text-4xl">
              Simple, trusted support for every pet parent.
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: 'Easy Discovery',
                description: 'Find animal-care providers in one place.',
                icon: LocateFixed,
              },
              {
                title: 'Trusted Information',
                description: 'Access useful provider details and service insights.',
                icon: CheckCircle2,
              },
              {
                title: 'Convenient Access',
                description: 'Contact providers and explore available services quickly.',
                icon: Clock3,
              },
            ].map(({ title, description, icon: Icon }) => (
              <div key={title} className="rounded-[28px] border border-[#D8E4D9] bg-white p-7 text-center shadow-soft">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF2E9] text-primary">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="text-2xl font-extrabold tracking-[-0.04em]">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-charcoal/70">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="about-us" className="section-shell py-20">
        <div className="soft-card overflow-hidden bg-white p-8 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">Join us</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] md:text-4xl">
                Are You an Animal Care Provider?
              </h2>
              <p className="mt-4 max-w-xl text-base leading-8 text-charcoal/70">
                Join PawCare and help more pet owners discover your services.
              </p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <button type="button" className="brand-btn px-7 py-4 text-base" onClick={onCreateBusiness}>
                List Your Business
              </button>
            </div>
          </div>
        </div>
      </section>

    </>
  )
}

function SearchPage({
  onEditProvider,
  onDeleteProvider,
}: {
  onEditProvider: (provider: Provider) => void
  onDeleteProvider: (provider: Provider) => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const { providers: allProviders } = useProviderStore()
  const routeState = location.state as {
    searchQuery?: string
    selectedCategory?: ServiceCategory | 'All Services'
    location?: string
  } | null
  const [query, setQuery] = useState(routeState?.searchQuery ?? '')
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | 'All Services'>(routeState?.selectedCategory ?? 'All Services')
  const [selectedLocation, setSelectedLocation] = useState(routeState?.location ?? 'All Locations')
  const [ratingFilter, setRatingFilter] = useState('Any')
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('Any')
  const [sortBy, setSortBy] = useState('relevance')
  const resultsRef = useRef<HTMLDivElement>(null)

  const serviceOptions: Array<ServiceCategory | 'All Services'> = ['All Services', ...serviceOrder]
  const locationOptions = [
    'All Locations',
    ...new Set([
      'Bengaluru',
      'Hyderabad',
      'Chennai',
      'Pune',
      ...allProviders.map((provider) => provider.location),
    ]),
  ]

  const filteredProviders = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase()
    const lowerLocation = selectedLocation.toLowerCase()

    const results = allProviders.filter((provider) => {
      const matchesCategory = selectedCategory === 'All Services' || provider.category === selectedCategory
      const matchesLocation =
        selectedLocation === 'All Locations' ||
        provider.location.toLowerCase().includes(lowerLocation) ||
        provider.address.toLowerCase().includes(lowerLocation)
      const matchesQuery =
        lowerQuery.length === 0 ||
        provider.name.toLowerCase().includes(lowerQuery) ||
        provider.location.toLowerCase().includes(lowerQuery) ||
        provider.address.toLowerCase().includes(lowerQuery) ||
        provider.services.some((service) => service.toLowerCase().includes(lowerQuery)) ||
        provider.category.toLowerCase().includes(lowerQuery)
      const matchesRating =
        ratingFilter === 'Any' ||
        (ratingFilter === '4.5+' && provider.rating >= 4.5) ||
        (ratingFilter === '4.0+' && provider.rating >= 4.0)
      const matchesAvailability =
        availabilityFilter === 'Any' ||
        provider.availability === availabilityFilter

      return matchesCategory && matchesLocation && matchesQuery && matchesRating && matchesAvailability
    })

    return results.sort((a, b) => {
      if (sortBy === 'rating') return b.rating - a.rating
      const score = (provider: Provider) =>
        lowerQuery.length === 0
          ? 0
          : (provider.name.toLowerCase().includes(lowerQuery) ? 3 : 0) +
            (provider.category.toLowerCase().includes(lowerQuery) ? 2 : 0) +
            (provider.location.toLowerCase().includes(lowerQuery) ||
            provider.address.toLowerCase().includes(lowerQuery)
              ? 2
              : 0) +
            (provider.services.some((service) => service.toLowerCase().includes(lowerQuery)) ? 1 : 0)
      return score(b) - score(a) || b.rating - a.rating || a.name.localeCompare(b.name)
    })
  }, [allProviders, availabilityFilter, query, ratingFilter, selectedCategory, selectedLocation, sortBy])

  const clearFilters = () => {
    setQuery('')
    setSelectedCategory('All Services')
    setSelectedLocation('All Locations')
    setRatingFilter('Any')
    setAvailabilityFilter('Any')
    setSortBy('relevance')
  }

  return (
    <section className="section-shell py-10 md:py-16">
      <div className="soft-card p-4 md:p-6">
        <form
          className="grid gap-3 md:grid-cols-[1fr_150px_180px_130px_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        >
          <div className="rounded-2xl border border-[#EAF2E9] bg-[#F7FAF7] p-3">
            <label htmlFor="results-search" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-charcoal/50">
              Search
            </label>
            <input
              id="results-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Provider, service or area"
              className="w-full bg-transparent text-base font-medium text-charcoal placeholder:text-charcoal/40 outline-none"
            />
          </div>

          <div className="rounded-2xl border border-[#EAF2E9] bg-[#F7FAF7] p-3">
            <label htmlFor="results-location" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-charcoal/50">
              Location
            </label>
            <select
              id="results-location"
              className="w-full bg-transparent text-base font-semibold text-charcoal outline-none"
              value={selectedLocation}
              onChange={(event) => setSelectedLocation(event.target.value)}
            >
              {locationOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </div>

          <div className="rounded-2xl border border-[#EAF2E9] bg-[#F7FAF7] p-3">
            <label htmlFor="results-category" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-charcoal/50">
              Category
            </label>
            <select
              id="results-category"
              className="w-full bg-transparent text-base font-semibold text-charcoal outline-none"
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value as ServiceCategory | 'All Services')}
            >
              {serviceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-[#EAF2E9] bg-[#F7FAF7] p-3">
            <label htmlFor="results-rating" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-charcoal/50">
              Rating
            </label>
            <select
              id="results-rating"
              className="w-full bg-transparent text-base font-semibold text-charcoal outline-none"
              value={ratingFilter}
              onChange={(event) => setRatingFilter(event.target.value)}
            >
              <option value="Any">Any</option>
              <option value="4.5+">4.5+</option>
              <option value="4.0+">4.0+</option>
            </select>
          </div>

          <button type="submit" className="brand-btn">
            <Search className="h-4 w-4" />
            Search
          </button>
        </form>

        <div className="mt-4 grid gap-3 md:grid-cols-[220px_220px_200px_auto]">
          <div className="rounded-2xl border border-[#EAF2E9] bg-[#F7FAF7] p-3">
            <label htmlFor="results-availability" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-charcoal/50">
              Availability
            </label>
            <select
              id="results-availability"
              className="w-full bg-transparent text-base font-semibold text-charcoal outline-none"
              value={availabilityFilter}
              onChange={(event) => setAvailabilityFilter(event.target.value as AvailabilityFilter)}
            >
              <option value="Any">Any</option>
              <option value="Open now">Open now</option>
              <option value="Available Today">Available Today</option>
              <option value="Open 24/7">Open 24/7</option>
            </select>
          </div>

          <div className="rounded-2xl border border-[#EAF2E9] bg-[#F7FAF7] p-3">
            <label htmlFor="results-sort" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-charcoal/50">
              Sort by
            </label>
            <select
              id="results-sort"
              className="w-full bg-transparent text-base font-semibold text-charcoal outline-none"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              <option value="relevance">Relevance</option>
              <option value="rating">Rating</option>
            </select>
          </div>

          <div className="flex items-end">
            <button type="button" className="secondary-btn w-full" onClick={clearFilters}>
              <Filter className="h-4 w-4" />
              Clear Filters
            </button>
          </div>

          <div className="flex items-end justify-end text-sm font-semibold text-charcoal/70">
            {filteredProviders.length} results
          </div>
        </div>
      </div>

      <div ref={resultsRef} className="mt-8 scroll-mt-24">
        {filteredProviders.length === 0 ? (
          <div className="soft-card flex min-h-[220px] items-center justify-center p-10 text-center">
            <div>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF2E9] text-primary">
                <Search className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-extrabold tracking-[-0.04em]">No providers match that search.</h3>
              <p className="mt-3 text-charcoal/70">Try a different service, rating or location to widen your results.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {filteredProviders.map((provider) => (
              <article key={provider.id} className="soft-card overflow-hidden">
                <div className="grid md:grid-cols-[220px_1fr]">
                  <img src={provider.image} alt={provider.name} className="h-full w-full object-cover md:h-full" />
                  <div className="p-5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-2xl font-extrabold tracking-[-0.04em]">{provider.name}</h3>
                        <p className="text-sm text-charcoal/55">{provider.category}</p>
                      </div>
                      {provider.isUserSubmitted ? (
                        <span className="rounded-full bg-[#F6F2E9] px-2.5 py-1 text-xs font-bold text-[#7C633D]">
                          User-submitted demo · not verified
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#F5F9F5] px-2.5 py-1 text-sm font-bold text-primary">
                          {provider.rating.toFixed(1)}
                        </span>
                      )}
                    </div>

                    {!provider.isUserSubmitted ? (
                      <div className="mb-3 flex items-center gap-1 text-amber-500">
                        {[...Array(5)].map((_, index) => (
                          <Star key={index} className="h-4 w-4 fill-current" />
                        ))}
                        <span className="ml-2 text-sm text-charcoal/60">({provider.reviewCount} reviews)</span>
                      </div>
                    ) : (
                      <p className="mb-3 text-xs text-charcoal/60">Not independently verified by PawCare.</p>
                    )}

                    <div className="mb-2 flex items-center gap-2 text-sm text-charcoal/70">
                      <MapPin className="h-4 w-4 text-primary" />
                      {provider.location}
                    </div>
                    <div className="mb-4 flex items-center gap-2 text-sm text-charcoal/70">
                      <Clock3 className="h-4 w-4 text-primary" />
                      {provider.hours}
                    </div>

                    <p className="text-sm leading-7 text-charcoal/70">{provider.description}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {provider.services.map((service) => (
                        <span key={service} className="rounded-full bg-[#EAF2E9] px-2.5 py-1 text-xs font-semibold text-primary">
                          {service}
                        </span>
                      ))}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button type="button" className="brand-btn" onClick={() => navigate(`/provider/${provider.id}`)}>
                        View Details
                      </button>
                      <a href={`tel:${provider.phone.replace(/\s+/g, '')}`} className="secondary-btn">
                        Call Now
                      </a>
                      {provider.isUserSubmitted ? (
                        <>
                          <button type="button" className="secondary-btn" onClick={() => onEditProvider(provider)}>Edit</button>
                          <button type="button" className="secondary-btn text-red-700 hover:border-red-300 hover:text-red-700" onClick={() => onDeleteProvider(provider)}>Delete</button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function ProviderDetailsPage({
  onEditProvider,
  onDeleteProvider,
}: {
  onEditProvider: (provider: Provider) => void
  onDeleteProvider: (provider: Provider) => void
}) {
  const { id } = useParams()
  const { providers: allProviders } = useProviderStore()
  const provider = allProviders.find((item) => String(item.id) === id)
  const [showEnquiryForm, setShowEnquiryForm] = useState(false)
  const [enquirySubmitted, setEnquirySubmitted] = useState(false)
  const [enquiryError, setEnquiryError] = useState('')
  const [enquiry, setEnquiry] = useState({ name: '', email: '', message: '' })
  const navigate = useNavigate()

  if (!provider) {
    return (
      <div className="section-shell py-16 text-center">
        <h2 className="text-3xl font-extrabold tracking-[-0.04em]">Provider not found.</h2>
        <button type="button" className="brand-btn mt-6" onClick={() => navigate('/search')}>
          Return to search
        </button>
      </div>
    )
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(provider.address)}`

  const handleEnquirySubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setEnquiryError('')
    if (!enquiry.name.trim() || !enquiry.email.trim() || !enquiry.message.trim()) {
      setEnquiryError('Please complete each field before sending your enquiry.')
      return
    }
    try {
      appendLocalSubmission('pawcare.enquiries', {
        providerId: String(provider.id),
        providerName: provider.name,
        ...enquiry,
      })
      setEnquirySubmitted(true)
    } catch (error) {
      console.error('Unable to save PawCare enquiry.', error)
      setEnquiryError('We could not save your enquiry in this browser. Check storage availability and try again.')
    }
  }

  return (
    <section className="section-shell py-10 md:py-16">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="secondary-btn" onClick={() => navigate('/search')}>
          ← Back to Search
        </button>
        {provider.isUserSubmitted ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="secondary-btn" onClick={() => onEditProvider(provider)}>Edit Business</button>
            <button
              type="button"
              className="secondary-btn text-red-700 hover:border-red-300 hover:text-red-700"
              onClick={() => onDeleteProvider(provider)}
            >
              Delete Business
            </button>
          </div>
        ) : null}
      </div>

      <div className="soft-card overflow-hidden">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <img src={provider.image} alt={provider.name} className="h-[360px] w-full object-cover lg:h-full" />
          </div>

          <div className="p-6 md:p-8">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">{provider.category}</p>
                <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.05em]">{provider.name}</h1>
              </div>
              {provider.isUserSubmitted ? (
                <span className="rounded-full bg-[#F6F2E9] px-3 py-1.5 text-xs font-bold text-[#7C633D]">
                  User-submitted demo listing
                </span>
              ) : (
                <div className="rounded-full bg-[#F5F9F5] px-3 py-1.5 text-sm font-bold text-primary">
                  {provider.rating.toFixed(1)} ★
                </div>
              )}
            </div>

            <div className="mb-4 flex items-center gap-2 text-sm text-charcoal/70">
              <MapPin className="h-4 w-4 text-primary" />
              {provider.location} · {provider.address}
            </div>

            <p className="text-base leading-8 text-charcoal/75">{provider.description}</p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <a href={`tel:${provider.phone.replace(/\s+/g, '')}`} className="brand-btn justify-center">
                <Phone className="h-4 w-4" />
                Call Now
              </a>
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="secondary-btn justify-center">
                <MapPin className="h-4 w-4" />
                Get Directions
              </a>
              <button type="button" className="secondary-btn justify-center sm:col-span-2" onClick={() => setShowEnquiryForm((value) => !value)}>
                <Mail className="h-4 w-4" />
                Send Enquiry
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-8 border-t border-[#EAF2E9] p-6 md:grid-cols-2 md:p-8">
          <div>
            <h2 className="mb-4 text-2xl font-extrabold tracking-[-0.04em]">Services offered</h2>
            <div className="flex flex-wrap gap-2">
              {provider.services.map((service) => (
                <span key={service} className="rounded-full bg-[#EAF2E9] px-3 py-2 text-sm font-semibold text-primary">
                  {service}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-2xl font-extrabold tracking-[-0.04em]">Operating hours</h2>
            <div className="space-y-3 text-sm text-charcoal/70">
              <div className="flex items-center gap-3">
                <Clock3 className="h-4 w-4 text-primary" />
                {provider.hours}
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-primary" />
                {provider.phone}
              </div>
              {provider.contactPerson ? (
                <div className="flex items-center gap-3">
                  <PawPrint className="h-4 w-4 text-primary" />
                  Contact: {provider.contactPerson}
                </div>
              ) : null}
              {provider.email ? (
                <a className="flex items-center gap-3 hover:text-primary" href={`mailto:${provider.email}`}>
                  <Mail className="h-4 w-4 text-primary" />
                  {provider.email}
                </a>
              ) : null}
              {provider.isUserSubmitted ? (
                <p className="rounded-xl bg-[#F6F2E9] p-3 text-xs leading-5 text-[#6D5735]">
                  This is a user-submitted demo listing and has not been independently verified by PawCare.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {showEnquiryForm ? (
        <div className="mt-8 soft-card p-6 md:p-8">
          <h2 className="mb-5 text-3xl font-extrabold tracking-[-0.04em]">Send an enquiry</h2>
          {enquirySubmitted ? (
            <div className="rounded-2xl border border-[#D8E4D9] bg-[#F5F9F5] p-4 text-sm text-charcoal/75">
              Your enquiry has been sent successfully. The provider will contact you soon.
            </div>
          ) : (
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleEnquirySubmit}>
              <div>
                <label htmlFor="enquiry-name" className="mb-2 block text-sm font-semibold text-charcoal">Name</label>
                <input
                  id="enquiry-name"
                  type="text"
                  value={enquiry.name}
                  onChange={(event) => setEnquiry({ ...enquiry, name: event.target.value })}
                  className="w-full rounded-2xl border border-[#D8E4D9] bg-white px-4 py-3 outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <label htmlFor="enquiry-email" className="mb-2 block text-sm font-semibold text-charcoal">Email</label>
                <input
                  id="enquiry-email"
                  type="email"
                  value={enquiry.email}
                  onChange={(event) => setEnquiry({ ...enquiry, email: event.target.value })}
                  className="w-full rounded-2xl border border-[#D8E4D9] bg-white px-4 py-3 outline-none focus:border-primary"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="enquiry-message" className="mb-2 block text-sm font-semibold text-charcoal">Message</label>
                <textarea
                  id="enquiry-message"
                  value={enquiry.message}
                  onChange={(event) => setEnquiry({ ...enquiry, message: event.target.value })}
                  rows={4}
                  className="w-full rounded-2xl border border-[#D8E4D9] bg-white px-4 py-3 outline-none focus:border-primary"
                  required
                />
              </div>

              <div className="md:col-span-2 flex justify-end">
                {enquiryError ? <p role="alert" className="mr-auto self-center text-sm text-red-700">{enquiryError}</p> : null}
                <button type="submit" className="brand-btn">
                  Send Message
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </section>
  )
}

function BusinessRegistrationModal({
  open,
  provider,
  onClose,
  onSubmit,
}: {
  open: boolean
  provider: Provider | null
  onClose: () => void
  onSubmit: (form: BusinessForm, image?: Blob) => Promise<Provider>
}) {
  const navigate = useNavigate()
  const [form, setForm] = useState<BusinessForm>(() => ({
    businessName: provider?.name ?? '',
    category: provider?.category ?? 'Veterinary Clinics',
    location: provider?.location ?? '',
    contactPerson: provider?.contactPerson ?? '',
    phone: provider?.phone ?? '',
    email: provider?.email ?? '',
    services: provider?.services.join(', ') ?? '',
  }))
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState(provider?.image ?? '')
  const previewObjectUrl = useRef<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [submissionError, setSubmissionError] = useState('')
  const [savedProvider, setSavedProvider] = useState<Provider | null>(null)

  if (!open) return null

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setSubmissionError('Choose a JPG, JPEG, PNG or WebP image.')
      event.target.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setSubmissionError('Choose an image smaller than 10 MB.')
      event.target.value = ''
      return
    }
    setSubmissionError('')
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current)
    const nextPreview = URL.createObjectURL(file)
    previewObjectUrl.current = nextPreview
    setImageFile(file)
    setImagePreview(nextPreview)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmissionError('')

    const nextErrors: Record<string, string> = {}
    if (!form.businessName.trim()) nextErrors.businessName = 'Business name is required.'
    if (!isServiceCategory(form.category)) nextErrors.category = 'Choose a service category.'
    if (!form.location.trim()) nextErrors.location = 'Location is required.'
    if (!form.contactPerson.trim()) nextErrors.contactPerson = 'Contact person is required.'
    if (!form.phone.trim()) nextErrors.phone = 'Phone number is required.'
    else if (
      !/^[+0-9 ()-]{7,20}$/.test(form.phone.trim()) ||
      form.phone.replace(/\D/g, '').length < 7
    ) {
      nextErrors.phone = 'Enter a valid phone number.'
    }
    if (!form.email.trim()) nextErrors.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Enter a valid email address.'
    }
    if (!form.services.split(/[,\n]/).some((service) => service.trim())) {
      nextErrors.services = 'Please list the services offered.'
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setSubmitted(false)
      return
    }

    setErrors({})
    try {
      const compressedImage = imageFile ? await compressProviderImage(imageFile) : undefined
      const updatedProvider = await onSubmit(form, compressedImage)
      setSavedProvider(updatedProvider)
      setSubmitted(true)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('already exists')) {
        console.error('Unable to save PawCare business registration.', error)
      }
      setSubmissionError(
        error instanceof Error
          ? error.message
          : 'We could not save your registration in this browser. Check storage availability and try again.',
      )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#244B38]/40 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="business-form-title" className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[30px] bg-white p-6 shadow-soft md:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">Provider registration</p>
            <h2 id="business-form-title" className="mt-2 text-3xl font-extrabold tracking-[-0.04em]">
              {provider ? 'Edit Your Business' : 'List Your Business'}
            </h2>
          </div>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D8E4D9]" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {submitted ? (
          <div className="rounded-2xl border border-[#D8E4D9] bg-[#F5F9F5] p-5 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h3 className="text-2xl font-extrabold tracking-[-0.04em]">
              {provider ? 'Business updated' : 'Registration received'}
            </h3>
            <p className="mt-3 text-charcoal/70">
              {provider
                ? 'Your user-submitted demo listing has been updated.'
                : 'Your user-submitted demo listing is now available in Featured Providers and search results.'}{' '}
              It has not been independently verified by PawCare.
            </p>
            {savedProvider ? (
              <button
                type="button"
                className="secondary-btn mt-5"
                onClick={() => {
                  onClose()
                  navigate(`/provider/${savedProvider.id}`)
                }}
              >
                View Your Listing
              </button>
            ) : null}
            <button type="button" className="brand-btn mt-5" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <div className="md:col-span-2">
              <label htmlFor="business-name" className="mb-2 block text-sm font-semibold text-charcoal">Business name</label>
              <input
                id="business-name"
                type="text"
                required
                value={form.businessName}
                onChange={(event) => setForm({ ...form, businessName: event.target.value })}
                className="w-full rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 outline-none focus:border-primary"
              />
              {errors.businessName ? <p className="mt-2 text-sm text-red-600">{errors.businessName}</p> : null}
            </div>

            <div className="md:col-span-2">
              <label htmlFor="business-image" className="mb-2 block text-sm font-semibold text-charcoal">
                Business image <span className="font-normal text-charcoal/55">(optional)</span>
              </label>
              <input
                id="business-image"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                className="block w-full cursor-pointer rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-[#EAF2E9] file:px-4 file:py-2 file:font-semibold file:text-primary"
              />
              <p className="mt-1 text-xs text-charcoal/55">JPG, PNG or WebP, up to 10 MB. Images are compressed and stored in this browser.</p>
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Business preview"
                  className="mt-3 h-36 w-full rounded-2xl border border-[#D8E4D9] object-cover sm:w-64"
                />
              ) : null}
            </div>

            <div>
              <label htmlFor="business-category" className="mb-2 block text-sm font-semibold text-charcoal">Service category</label>
              <select
                id="business-category"
                required
                value={form.category}
                onChange={(event) => {
                  if (isServiceCategory(event.target.value)) {
                    setForm({ ...form, category: event.target.value })
                  }
                }}
                className="w-full rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 outline-none focus:border-primary"
              >
                {serviceOrder.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {errors.category ? <p className="mt-2 text-sm text-red-600">{errors.category}</p> : null}
            </div>

            <div>
              <label htmlFor="business-location" className="mb-2 block text-sm font-semibold text-charcoal">Location</label>
              <input
                id="business-location"
                type="text"
                required
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
                className="w-full rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 outline-none focus:border-primary"
              />
              {errors.location ? <p className="mt-2 text-sm text-red-600">{errors.location}</p> : null}
            </div>

            <div>
              <label htmlFor="business-contact" className="mb-2 block text-sm font-semibold text-charcoal">Contact person</label>
              <input
                id="business-contact"
                type="text"
                required
                value={form.contactPerson}
                onChange={(event) => setForm({ ...form, contactPerson: event.target.value })}
                className="w-full rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 outline-none focus:border-primary"
              />
              {errors.contactPerson ? <p className="mt-2 text-sm text-red-600">{errors.contactPerson}</p> : null}
            </div>

            <div>
              <label htmlFor="business-phone" className="mb-2 block text-sm font-semibold text-charcoal">Phone number</label>
              <input
                id="business-phone"
                type="tel"
                required
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                className="w-full rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 outline-none focus:border-primary"
              />
              {errors.phone ? <p className="mt-2 text-sm text-red-600">{errors.phone}</p> : null}
            </div>

            <div>
              <label htmlFor="business-email" className="mb-2 block text-sm font-semibold text-charcoal">Email</label>
              <input
                id="business-email"
                type="email"
                required
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                className="w-full rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 outline-none focus:border-primary"
              />
              {errors.email ? <p className="mt-2 text-sm text-red-600">{errors.email}</p> : null}
            </div>

            <div className="md:col-span-2">
              <label htmlFor="business-services" className="mb-2 block text-sm font-semibold text-charcoal">Services offered</label>
              <textarea
                id="business-services"
                rows={3}
                required
                value={form.services}
                onChange={(event) => setForm({ ...form, services: event.target.value })}
                className="w-full rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 outline-none focus:border-primary"
              />
              {errors.services ? <p className="mt-2 text-sm text-red-600">{errors.services}</p> : null}
            </div>

            <div className="md:col-span-2 flex flex-wrap justify-end gap-3">
              <button type="button" className="secondary-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="brand-btn">
                {provider ? 'Save Changes' : 'Submit Application'}
              </button>
            </div>
            {submissionError ? (
              <p role="alert" className="md:col-span-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {submissionError}
              </p>
            ) : null}
          </form>
        )}
      </div>
    </div>
  )
}

function ConfirmDeleteModal({
  provider,
  error,
  onCancel,
  onConfirm,
}: {
  provider: Provider
  error: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#244B38]/40 p-4 backdrop-blur-sm">
      <div role="alertdialog" aria-modal="true" aria-labelledby="delete-provider-title" className="w-full max-w-md rounded-[30px] bg-white p-6 shadow-soft md:p-8">
        <h2 id="delete-provider-title" className="text-2xl font-extrabold tracking-[-0.04em]">Delete this business?</h2>
        <p className="mt-3 text-sm leading-6 text-charcoal/70">
          This will permanently remove <strong>{provider.name}</strong> and its uploaded image from this browser. This action cannot be undone.
        </p>
        {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="secondary-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="brand-btn bg-red-700 hover:bg-red-800" onClick={onConfirm}>Delete Business</button>
        </div>
      </div>
    </div>
  )
}

function CorrectionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', provider: '', details: '' })
  const [submitted, setSubmitted] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  if (!open) return null

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    if (!form.name.trim() || !form.email.trim() || !form.provider.trim() || !form.details.trim()) {
      setErrorMessage('Please complete each field before submitting your correction.')
      return
    }
    try {
      appendLocalSubmission('pawcare.corrections', form)
      setSubmitted(true)
    } catch (error) {
      console.error('Unable to save PawCare correction.', error)
      setErrorMessage('We could not save your correction in this browser. Check storage availability and try again.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#244B38]/40 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="correction-title" className="w-full max-w-xl rounded-[30px] bg-white p-6 shadow-soft md:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">Help us improve</p>
            <h2 id="correction-title" className="mt-2 text-3xl font-extrabold tracking-[-0.04em]">Submit a Correction</h2>
          </div>
          <button type="button" aria-label="Close correction form" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D8E4D9]" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {submitted ? (
          <div className="rounded-2xl border border-[#D8E4D9] bg-[#F5F9F5] p-5 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h3 className="text-2xl font-extrabold tracking-[-0.04em]">Thank you for the update</h3>
            <p className="mt-3 text-sm leading-6 text-charcoal/70">Your correction has been saved in this browser for review.</p>
            <button type="button" className="brand-btn mt-5" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <label htmlFor="correction-name" className="mb-2 block text-sm font-semibold">Your name</label>
              <input id="correction-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 outline-none focus:border-primary" />
            </div>
            <div>
              <label htmlFor="correction-email" className="mb-2 block text-sm font-semibold">Email address</label>
              <input id="correction-email" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 outline-none focus:border-primary" />
            </div>
            <div>
              <label htmlFor="correction-provider" className="mb-2 block text-sm font-semibold">Provider or listing</label>
              <input id="correction-provider" required value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })} className="w-full rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 outline-none focus:border-primary" />
            </div>
            <div>
              <label htmlFor="correction-details" className="mb-2 block text-sm font-semibold">What needs correcting?</label>
              <textarea id="correction-details" required rows={4} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} className="w-full rounded-2xl border border-[#D8E4D9] bg-[#F9FBF9] px-4 py-3 outline-none focus:border-primary" />
            </div>
            {errorMessage ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p> : null}
            <div className="flex justify-end gap-3">
              <button type="button" className="secondary-btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="brand-btn">Submit Correction</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default App
