"use strict";

const events = require("../events.js");
const views = require("../util/views.js");

const template = views.getTemplate("posts-page");

let gridObserver = null;

class PostsPageView extends events.EventTarget {
    constructor(ctx) {
        super();
        this._ctx = ctx;
        this._hostNode = ctx.hostNode;
        views.replaceContent(this._hostNode, template(ctx));
        this._observeGrid();

        this._postIdToPost = {};
        for (let post of ctx.response.results) {
            this._postIdToPost[post.id] = post;
            post.addEventListener("change", (e) => this._evtPostChange(e));
        }

        this._postIdToListItemNode = {};
        for (let listItemNode of this._listItemNodes) {
            const postId = listItemNode.getAttribute("data-post-id");
            const post = this._postIdToPost[postId];
            this._postIdToListItemNode[postId] = listItemNode;

            const tagFlipperNode = this._getTagFlipperNode(listItemNode);
            if (tagFlipperNode) {
                tagFlipperNode.addEventListener("click", (e) =>
                    this._evtBulkEditTagsClick(e, post)
                );
            }

            const safetyFlipperNode = this._getSafetyFlipperNode(listItemNode);
            if (safetyFlipperNode) {
                for (let linkNode of safetyFlipperNode.querySelectorAll("a")) {
                    linkNode.addEventListener("click", (e) =>
                        this._evtBulkEditSafetyClick(e, post)
                    );
                }
            }

            const deleteFlipperNode = this._getDeleteFlipperNode(listItemNode);
            if (deleteFlipperNode) {
                deleteFlipperNode.addEventListener("click", (e) =>
                    this._evtBulkToggleDeleteClick(e, post)
                );
            }
        }

        this._syncBulkEditorsHighlights();
        this._fitGrid();
    }

    get _listItemNodes() {
        return this._hostNode.querySelectorAll("li");
    }

    _getTagFlipperNode(listItemNode) {
        return listItemNode.querySelector(".tag-flipper");
    }

    _getSafetyFlipperNode(listItemNode) {
        return listItemNode.querySelector(".safety-flipper");
    }

    _getDeleteFlipperNode(listItemNode) {
        return listItemNode.querySelector(".delete-flipper");
    }

    _observeGrid() {
        PostsPageView.stopFittingGrid();
        const listNode = this._hostNode.querySelector(".post-list");
        if (
            !listNode ||
            listNode.classList.contains("post-flow") ||
            !document.body.classList.contains("posts-fit")
        ) {
            return;
        }
        gridObserver = new ResizeObserver(() => this._fitGrid());
        gridObserver.observe(listNode);
    }

    _fitGrid() {
        const listNode = this._hostNode.querySelector(".post-list");
        const ulNode = listNode && listNode.querySelector("ul");
        if (
            !listNode ||
            !ulNode ||
            listNode.classList.contains("post-flow") ||
            !document.body.classList.contains("posts-fit")
        ) {
            return;
        }

        const items = ulNode.querySelectorAll("li:not(.flexbox-dummy)");
        if (!items.length) {
            return;
        }

        const firstTop = items[0].offsetTop;
        let cols = 0;
        for (let i = 0; i < items.length; i++) {
            if (items[i].offsetTop !== firstTop) {
                break;
            }
            cols++;
        }

        const styles = getComputedStyle(ulNode);
        const gapY = parseFloat(styles.rowGap || styles.gap) || 0;
        const availH = listNode.clientHeight;
        if (availH <= 0 || cols <= 0) {
            return;
        }

        const rows = Math.ceil(items.length / cols);
        const maxRowH = window.innerWidth * 0.09;
        const rowH = Math.max(
            0,
            Math.min(maxRowH, (availH - gapY * (rows - 1)) / rows)
        );
        listNode.style.setProperty("--post-grid-row-height", rowH + "px");
    }

    static stopFittingGrid() {
        if (gridObserver) {
            gridObserver.disconnect();
            gridObserver = null;
        }
    }

    _evtPostChange(e) {
        const listItemNode = this._postIdToListItemNode[e.detail.post.id];
        for (let node of listItemNode.querySelectorAll("[data-disabled]")) {
            node.removeAttribute("data-disabled");
        }
        this._syncBulkEditorsHighlights();
    }

    _evtBulkEditTagsClick(e, post) {
        e.preventDefault();
        const linkNode = e.target;
        if (linkNode.getAttribute("data-disabled")) {
            return;
        }
        linkNode.setAttribute("data-disabled", true);
        this.dispatchEvent(
            new CustomEvent(
                linkNode.classList.contains("tagged") ? "untag" : "tag",
                {
                    detail: { post: post },
                }
            )
        );
    }

    _evtBulkEditSafetyClick(e, post) {
        e.preventDefault();
        const linkNode = e.target;
        if (linkNode.getAttribute("data-disabled")) {
            return;
        }
        const newSafety = linkNode.getAttribute("data-safety");
        if (post.safety === newSafety) {
            return;
        }
        linkNode.setAttribute("data-disabled", true);
        this.dispatchEvent(
            new CustomEvent("changeSafety", {
                detail: { post: post, safety: newSafety },
            })
        );
    }

    _evtBulkToggleDeleteClick(e, post) {
        e.preventDefault();
        const linkNode = e.target;
        linkNode.classList.toggle("delete");
        this.dispatchEvent(
            new CustomEvent("markForDeletion", {
                detail: {
                    post,
                    delete: linkNode.classList.contains("delete"),
                },
            })
        );
    }

    _syncBulkEditorsHighlights() {
        for (let listItemNode of this._listItemNodes) {
            const postId = listItemNode.getAttribute("data-post-id");
            const post = this._postIdToPost[postId];

            const tagFlipperNode = this._getTagFlipperNode(listItemNode);
            if (tagFlipperNode) {
                let tagged = true;
                for (let tag of this._ctx.bulkEdit.tags) {
                    tagged &= post.tags.isTaggedWith(tag);
                }
                tagFlipperNode.classList.toggle("tagged", tagged);
            }

            const safetyFlipperNode = this._getSafetyFlipperNode(listItemNode);
            if (safetyFlipperNode) {
                for (let linkNode of safetyFlipperNode.querySelectorAll("a")) {
                    const safety = linkNode.getAttribute("data-safety");
                    linkNode.classList.toggle(
                        "active",
                        post.safety === safety
                    );
                }
            }

            const deleteFlipperNode = this._getDeleteFlipperNode(listItemNode);
            if (deleteFlipperNode) {
                deleteFlipperNode.classList.toggle(
                    "delete",
                    this._ctx.bulkEdit.markedForDeletion.some(
                        (x) => x.id == postId
                    )
                );
            }
        }
    }
}

module.exports = PostsPageView;
