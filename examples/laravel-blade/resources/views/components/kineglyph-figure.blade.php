{{--
    <x-kineglyph-figure scene="request-path" theme="docs" static="/img/figures/request-path.svg" />

    Renders a host element that the Kineglyph runtime mounts into. Every instance gets its own
    controller and DOM ids, so several figures can share one article without collisions.
    Requires resources/js/kineglyph.js (Vite) or the self-contained bundle to be loaded once.

    The host advertises aria-busy="true" until the runtime mounts; mountKineglyph sets it to
    "false" on success and removes it again on destroy. `static` (optional) is the URL of a
    static SVG/PNG export of the same scene (produced with `kineglyph-export`): it is shown when
    JavaScript is unavailable and used as the accessible fallback image.
--}}
@props([
    'scene',
    'theme' => 'docs',
    'layout' => 'auto',
    'autoplay' => true,
    'controls' => true,
    'readout' => true,
    'width' => null,
    'caption' => null,
    'static' => null,
    'alt' => null,
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
        @if ($static !== null) data-static="{{ $static }}" @endif
        aria-busy="true"
    >
        @if ($static !== null)
            {{-- Progressive enhancement: the static export shows until (or unless) the runtime mounts. --}}
            <noscript>
                <img src="{{ $static }}" alt="{{ $alt ?? $caption ?? $scene }}" style="max-width:100%;height:auto" />
            </noscript>
        @else
            <noscript>This illustration is interactive and needs JavaScript to render.</noscript>
        @endif
    </div>
    @if ($caption)
        <figcaption class="kineglyph-figure__caption">{{ $caption }}</figcaption>
    @endif
</figure>
