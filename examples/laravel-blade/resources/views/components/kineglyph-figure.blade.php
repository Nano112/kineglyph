{{--
    <x-kineglyph-figure scene="fast-generation" theme="nucleation" />

    Renders a host element that the Kineglyph runtime mounts into. Every instance gets its own
    controller and DOM ids, so several figures can share one article without collisions.
    Requires resources/js/kineglyph.js (Vite) or the self-contained bundle to be loaded once.
--}}
@props([
    'scene',
    'theme' => 'nucleation',
    'layout' => 'auto',
    'autoplay' => true,
    'controls' => true,
    'readout' => true,
    'width' => null,
    'caption' => null,
])

<figure {{ $attributes->merge(['class' => 'kineglyph-figure']) }}>
    <div
        data-kineglyph="{{ $scene }}"
        data-theme="{{ $theme }}"
        data-layout="{{ $layout }}"
        data-autoplay="{{ $autoplay ? 'true' : 'false' }}"
        data-controls="{{ $controls ? 'true' : 'false' }}"
        data-readout="{{ $readout ? 'true' : 'false' }}"
        @if ($width !== null) data-width="{{ $width }}" @endif
        aria-busy="true"
    >
        {{-- Progressive enhancement: the runtime replaces this placeholder on mount. --}}
        <noscript>This illustration needs JavaScript to animate; the static export is linked below.</noscript>
    </div>
    @if ($caption)
        <figcaption class="kineglyph-figure__caption">{{ $caption }}</figcaption>
    @endif
</figure>
