import Link from 'next/link';
import { ArrowLeft, Trash2, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { db } from '@/db';
import { exhibitions, exhibitionArtworks, exhibitionArtists } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExhibitionEditPage({ params }: Props) {
  const { id } = await params;

  // Handle "new" as a special case
  if (id === 'new') {
    return <NewExhibitionForm />;
  }

  const exhibition = await db.query.exhibitions.findFirst({
    where: eq(exhibitions.id, id),
    with: {
      coverImage: true,
      artworks: {
        with: {
          artwork: {
            with: {
              artist: true,
              images: {
                with: {
                  image: true,
                },
              },
            },
          },
        },
      },
      artists: {
        with: {
          artist: true,
        },
      },
    },
  });

  if (!exhibition) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/exhibitions"
                className="p-2 -ml-2 text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-xl font-semibold text-gray-900">
                {exhibition.title}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/exhibitions/${exhibition.slug}.html`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                <ExternalLink className="w-4 h-4" />
                View
              </a>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900">
                {exhibition.isEnabled ? (
                  <>
                    <EyeOff className="w-4 h-4" />
                    Hide
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" />
                    Show
                  </>
                )}
              </button>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:text-red-700">
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
              <button className="px-4 py-2 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-6">
            <button className="py-4 text-sm font-medium border-b-2 border-black text-gray-900">
              General
            </button>
            <button className="py-4 text-sm font-medium text-gray-500 hover:text-gray-700">
              Selected Works ({exhibition.artworks?.length || 0})
            </button>
            <button className="py-4 text-sm font-medium text-gray-500 hover:text-gray-700">
              Artists ({exhibition.artists?.length || 0})
            </button>
          </nav>
        </div>
      </div>

      {/* Form Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form className="space-y-8">
          {/* Basic Info */}
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Basic Information
            </h2>

            <div className="space-y-6">
              <div>
                <label
                  htmlFor="title"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Title
                </label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  defaultValue={exhibition.title}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-black focus:border-black"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="subtitle"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Subtitle
                  </label>
                  <input
                    type="text"
                    id="subtitle"
                    name="subtitle"
                    defaultValue={exhibition.subtitle || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-black focus:border-black"
                  />
                </div>

                <div>
                  <label
                    htmlFor="slug"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    URL Slug
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                      /exhibitions/
                    </span>
                    <input
                      type="text"
                      id="slug"
                      name="slug"
                      defaultValue={exhibition.slug}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md shadow-sm focus:ring-black focus:border-black"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Dates */}
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Dates</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label
                  htmlFor="startDate"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Start Date
                </label>
                <input
                  type="date"
                  id="startDate"
                  name="startDate"
                  defaultValue={exhibition.startDate || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-black focus:border-black"
                />
              </div>

              <div>
                <label
                  htmlFor="endDate"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  End Date
                </label>
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  defaultValue={exhibition.endDate || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-black focus:border-black"
                />
              </div>

              <div>
                <label
                  htmlFor="status"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  defaultValue={exhibition.status || 'current'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-black focus:border-black"
                >
                  <option value="current">Current</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="past">Past</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label
                htmlFor="dateText"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Display Date Text
              </label>
              <input
                type="text"
                id="dateText"
                name="dateText"
                defaultValue={exhibition.dateText || ''}
                placeholder="e.g., January 15 – February 28, 2024"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-black focus:border-black"
              />
              <p className="mt-1 text-sm text-gray-500">
                This is displayed on the exhibition page. Auto-generated if left blank.
              </p>
            </div>
          </section>

          {/* Cover Image */}
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Cover Image</h2>

            <div className="flex items-start gap-6">
              <div className="w-48 h-32 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                {exhibition.coverImage ? (
                  <img
                    src={`${process.env.R2_PUBLIC_URL}/images/${exhibition.coverImage.hash}/card.webp`}
                    alt={exhibition.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-gray-400 text-sm">No image</span>
                )}
              </div>
              <div className="flex-1">
                <button
                  type="button"
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Upload Image
                </button>
                <p className="mt-2 text-sm text-gray-500">
                  Recommended: Landscape image, at least 1120x640 pixels
                </p>
              </div>
            </div>
          </section>
        </form>
      </main>
    </div>
  );
}

function NewExhibitionForm() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/exhibitions"
                className="p-2 -ml-2 text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-xl font-semibold text-gray-900">
                New Exhibition
              </h1>
            </div>
            <button className="px-4 py-2 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors">
              Create Exhibition
            </button>
          </div>
        </div>
      </header>

      {/* Form Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form className="space-y-8">
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Basic Information
            </h2>

            <div className="space-y-6">
              <div>
                <label
                  htmlFor="title"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Title
                </label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  placeholder="Exhibition Title"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-black focus:border-black"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="startDate"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Start Date
                  </label>
                  <input
                    type="date"
                    id="startDate"
                    name="startDate"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-black focus:border-black"
                  />
                </div>

                <div>
                  <label
                    htmlFor="endDate"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    End Date
                  </label>
                  <input
                    type="date"
                    id="endDate"
                    name="endDate"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-black focus:border-black"
                  />
                </div>
              </div>
            </div>
          </section>
        </form>
      </main>
    </div>
  );
}
