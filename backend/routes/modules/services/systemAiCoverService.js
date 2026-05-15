const buildFallbackCover = (proposal) => {
    const seed = (proposal.imageKeywords || proposal.title).replace(/\s+/g, '-').toLowerCase().slice(0, 30);
    return `https://picsum.photos/seed/${seed}/800/400`;
};

const resolveSystemAiCover = async (proposal) => {
    if (process.env.UNSPLASH_ACCESS_KEY) {
        try {
            const response = await fetch(
                `https://api.unsplash.com/photos/random?query=${encodeURIComponent(proposal.imageKeywords || proposal.title)}&orientation=landscape&client_id=${process.env.UNSPLASH_ACCESS_KEY}`
            );
            if (response.ok) {
                const data = await response.json();
                if (data?.urls?.regular) {
                    return data.urls.regular;
                }
            }
        } catch (_) {
            // fall back below
        }
    }

    return buildFallbackCover(proposal);
};

module.exports = {
    resolveSystemAiCover,
};
