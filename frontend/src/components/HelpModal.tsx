import { X } from "lucide-react";

interface Props {
    open: boolean;
    onClose: () => void;
}

export default function HelpModal({ open, onClose }: Props) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-card border border-border rounded-xl shadow-lg w-full max-w-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 rounded-md hover:bg-surface-hover text-muted-foreground"
                    aria-label="Fermer"
                    title="Fermer"
                >
                    <X className="w-4 h-4" />
                </button>

                <h2 className="text-lg font-semibold text-card-foreground pr-8">Aide</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Raccourcis clavier, recherche, variables et actions rapides.
                </p>

                <div className="mt-6 space-y-6">
                    <section>
                        <h3 className="text-sm font-semibold text-foreground">Raccourcis</h3>
                        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            <li>
                                <span className="font-mono text-foreground">Ctrl/Cmd + P</span> : ouvrir la palette (recherche rapide)
                            </li>
                            <li>
                                <span className="font-mono text-foreground">Ctrl/Cmd + K</span> : focus sur la recherche
                            </li>
                            <li>
                                <span className="font-mono text-foreground">Entrée</span> (palette) : copier la commande sélectionnée
                            </li>
                            <li>
                                <span className="font-mono text-foreground">Esc</span> : fermer la palette / les modals
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-foreground">Palette (Ctrl/Cmd + P)</h3>
                        <div className="mt-2 text-sm text-muted-foreground space-y-2">
                            <p>
                                La palette s’ouvre en overlay et affiche par défaut les <strong className="text-foreground">10 commandes les plus copiées</strong>.
                                Quand tu commences à taper, elle lance une recherche serveur.
                            </p>
                            <p>
                                Le nombre à droite correspond au <strong className="text-foreground">nombre de copies</strong>.
                            </p>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-foreground">Recherche avancée</h3>
                        <div className="mt-2 text-sm text-muted-foreground space-y-2">
                            <p>
                                Tu peux utiliser des opérateurs (dans la barre de recherche ou dans la palette) :
                            </p>
                            <ul className="space-y-1">
                                <li>
                                    <span className="font-mono text-foreground">tag:docker</span> — filtrer par tag
                                </li>
                                <li>
                                    <span className="font-mono text-foreground">group:prod</span> — filtrer par groupe (nom exact)
                                </li>
                                <li>
                                    <span className="font-mono text-foreground">fav:true</span> — seulement les favoris
                                </li>
                            </ul>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-foreground">Copie & variables</h3>
                        <div className="mt-2 text-sm text-muted-foreground space-y-2">
                            <p>
                                Si une commande contient des variables <span className="font-mono text-foreground">{"{{VAR}}"}</span>, le bouton Copy (ou la palette)
                                ouvre un modal pour remplir les valeurs.
                            </p>
                            <ul className="space-y-1">
                                <li>Copy as-is : copie la commande telle quelle</li>
                                <li>Copy with values : remplace les variables par tes valeurs</li>
                            </ul>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-foreground">Organisation & actions</h3>
                        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            <li>Groupes : organise tes commandes par contexte (projet, environnement…)</li>
                            <li>Tags : clique sur un tag d’une commande pour filtrer</li>
                            <li>Favoris : l’étoile permet de marquer une commande</li>
                            <li>Tri : Recent / Most copied</li>
                            <li>Affichage : Vertical / Horizontal</li>
                            <li>Vue : bouton View pour ouvrir une commande en modal</li>
                        </ul>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-foreground">Sélection multiple</h3>
                        <div className="mt-2 text-sm text-muted-foreground space-y-2">
                            <p>
                                Active le mode <strong className="text-foreground">Select</strong> pour cocher plusieurs commandes.
                                Une barre d’actions s’affiche en bas (Move / Export / Favorite / Delete).
                            </p>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-foreground">Import / Export</h3>
                        <div className="mt-2 text-sm text-muted-foreground space-y-2">
                            <p>
                                Export (JSON/CSV/PDF) et import JSON sont accessibles depuis la sidebar.
                                Tu peux aussi exporter une sélection via la barre d’actions.
                            </p>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-foreground">Dashboard</h3>
                        <div className="mt-2 text-sm text-muted-foreground">
                            Le dashboard affiche des compteurs (commandes, groupes, tags) et les copies sur une plage de dates.
                        </div>
                    </section>
                </div>

                <div className="flex justify-end mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm rounded-md bg-accent-blue text-accent-blue-foreground hover:opacity-90 transition-all font-medium"
                    >
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    );
}
