// 修改类声明，防止重复定义
if (typeof window.FriendCircleLite === 'undefined') {
    window.FriendCircleLite = class {
        constructor(rootId) {
            this.root = document.getElementById(rootId);
            if (!this.root) return;
            
            const config = UserConfig ?? {};
            this.pageSize = config.page_turning_number ?? 25;
            this.apiUrl = config.private_api_url ?? 'https://fc.ruom.top';
            this.errorImg = config.error_img ?? 'https://fastly.jsdelivr.net/gh/JLinMr/Friend-Circle-Lite@latest/static/favicon.ico';
            this.start = 0;
            this.allArticles = [];
            this.cacheDuration = config.cache_duration ?? 10 * 60 * 1000; // 默认10分钟

            this.throttledLoadMore = this.throttle(this.loadMore.bind(this), 500);
            this.imageObserver = new IntersectionObserver(this.handleImageIntersection.bind(this));

            this.init();
            window.fcInstance = this;
        }

        init() {
            this.elements = {
                container: this.root.querySelector('.articles-container'),
                loadMore: this.root.querySelector('#load-more'),
                stats: this.root.querySelector('#stats'),
                random: this.root.querySelector('#random-article')
            };

            // 事件委托
            this.root.addEventListener('click', e => this.handleClick(e));
            window.updateRandomArticle = () => this.updateRandomArticle();
            
            this.loadInitialContent();
        }

        async loadInitialContent() {
            // 移除添加骨架屏的逻辑，直接加载文章
            await this.loadArticles();
        }

        async loadArticles() {
            try {
                const {data} = await this.fetchArticlesWithCache();
                if (data?.article_data) {
                    this.allArticles = data.article_data;
                    this.updateStats(data.statistical_data);
                    this.updateRandomArticle();
                    await this.displayArticles(true);
                }
            } catch (error) {
                console.error('加载文章失败:', error);
                this.elements.loadMore.textContent = '加载失败';
            }
        }

        async fetchArticlesWithCache() {
            const cacheKey = 'friend-circle-lite-cache';
            const cacheTimeKey = 'friend-circle-lite-cache-time';
            
            try {
                const cacheTime = localStorage.getItem(cacheTimeKey);
                const now = Date.now();
                
                if (cacheTime && (now - parseInt(cacheTime) < this.cacheDuration)) {
                    const cachedData = localStorage.getItem(cacheKey);
                    if (cachedData) return { data: JSON.parse(cachedData), fromCache: true };
                }

                const response = await fetch(`${this.apiUrl}all.json`);
                const data = await response.json();
                
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(data));
                    localStorage.setItem(cacheTimeKey, now.toString());
                } catch (e) {
                    console.warn('缓存存储失败:', e);
                }
                
                return { data, fromCache: false };
            } catch (error) {
                throw new Error('获取文章列表失败');
            }
        }

        async displayArticles(isInitial = false) {
            const start = isInitial ? 0 : this.start;
            const articles = this.allArticles.slice(start, start + this.pageSize);
            
            if (articles.length === 0) {
                this.elements.loadMore.style.display = 'none';
                return;
            }

            if (isInitial) {
                this.elements.container.innerHTML = '';
            }

            const fragment = document.createDocumentFragment();
            articles.forEach(article => {
                fragment.appendChild(this.createCard(article));
            });
            
            this.elements.container.appendChild(fragment);
            
            // 使用 requestAnimationFrame 优化动画显示
            const animateCards = () => {
                const cards = this.elements.container.querySelectorAll('.card.loading');
                let index = 0;
                
                const animate = () => {
                    if (index >= cards.length) return;
                    
                    const card = cards[index];
                    card.classList.remove('loading');
                    card.querySelector('.skeleton-content').classList.add('hidden');
                    card.querySelector('.real-content').classList.remove('hidden');
                    
                    index++;
                    requestAnimationFrame(animate);
                };

                setTimeout(() => {
                    requestAnimationFrame(animate);
                }, isInitial ? 1000 : 500);
            };

            animateCards();

            this.start += this.pageSize;
            this.elements.loadMore.style.display = 
                this.start >= this.allArticles.length ? 'none' : 'block';
        }

        createCard(article, isLoading = true) {
            const card = document.createElement('div');
            card.className = `card ${isLoading ? 'loading' : ''}`;
            
            card.innerHTML = `
                ${isLoading ? `
                    <div class="skeleton-content">
                        <div class="skeleton card-title"></div>
                        <div class="card-info">
                            <div class="skeleton card-author"></div>
                            <div class="skeleton card-date"></div>
                        </div>
                    </div>
                ` : ''}
                <div class="real-content ${isLoading ? 'hidden' : ''}">
                    <div class="card-title" data-link="${article.link}">${article.title}</div>
                    <div class="card-info">
                        <div class="card-author" data-author="${article.author}" data-avatar="${article.avatar}" data-link="${article.link}">
                            <img src="${article.avatar}" data-error-img="${this.errorImg}" onerror="if(!this.retried){this.retried=true;this.src=this.dataset.errorImg}">
                            ${article.author}
                        </div>
                        <div class="card-date">🗓️${article.created?.substring(0, 10) || ''}</div>
                    </div>
                    <img class="card-bg" src="${article.avatar}" data-error-img="${this.errorImg}" onerror="if(!this.retried){this.retried=true;this.src=this.dataset.errorImg}">
                </div>
            `;
            
            return card;
        }

        handleClick(e) {
            const target = e.target;
            
            if (target.closest('.card-title')) {
                const link = target.closest('.card-title').dataset.link;
                if (link) window.open(link, '_blank');
            }
            
            if (target.closest('.card-author')) {
                const authorData = target.closest('.card-author').dataset;
                if (authorData.author && authorData.avatar && authorData.link) {
                    this.showAuthorModal(authorData);
                }
            }
            
            if (target.id === 'load-more') {
                this.loadMore();
            }

            if (target.classList.contains('random-refresh') || target.closest('.random-refresh')) {
                this.updateRandomArticle();
            }

            if (target.classList.contains('random-title')) {
                const link = target.dataset.link;
                if (link) window.open(link, '_blank');
            }
            
            if (target.classList.contains('random-author')) {
                const authorData = {
                    author: target.dataset.author,
                    avatar: target.dataset.avatar,
                    link: target.dataset.link
                };
                this.showAuthorModal(authorData);
            }
        }

        updateStats(stats) {
            if (!stats) return;
            this.elements.stats.innerHTML = `
                <div>Powered by: <a href="https://github.com/willow-god/Friend-Circle-Lite" target="_blank" rel="nofollow">FriendCircleLite</a></div>
                <div>Designed By: <a href="https://www.liushen.fun/" target="_blank" rel="nofollow">LiuShen</a></div>
                <div>订阅:${stats.friends_num} 活跃:${stats.active_num} 总文章数:${stats.article_num}</div>
                <div>更新时间:${stats.last_updated_time}</div>
            `;
        }

        updateRandomArticle() {
            const randomArticle = this.allArticles[Math.floor(Math.random() * this.allArticles.length)];
            if (!randomArticle) return;
            
            this.elements.random.innerHTML = `
                <div class="random-header">
                    <span>🎣 钓鱼</span>
                    <svg class="random-refresh" viewBox="0 0 1024 1024" width="16" height="16">
                        <path d="M772.6 320H672c-35.4 0-64 28.6-64 64s28.6 64 64 64h256c35.4 0 64-28.6 64-64V128c0-35.4-28.6-64-64-64s-64 28.6-64 64v102.4l-35.2-35.2c-175-175-458.6-175-633.6 0s-175 458.6 0 633.6 458.6 175 633.6 0c25-25 25-65.6 0-90.6s-65.6-25-90.6 0c-125 125-327.6 125-452.6 0s-125-327.6 0-452.6 327.6-125 452.6 0l34.4 34.4z"></path>
                    </svg>
                </div>
                <div class="random-content">
                    太牛了🤠 ！大师！ 你钓到了
                    <span class="random-author" data-author="${randomArticle.author}" 
                        data-avatar="${randomArticle.avatar}" 
                        data-link="${randomArticle.link}">🐟 ${randomArticle.author}</span>
                    的
                    <span class="random-title" data-link="${randomArticle.link}">${randomArticle.title}</span>
                </div>
            `;
        }

        showAuthorModal({author, avatar, link}) {
            // 检查是否已存在 modal
            let modal = document.getElementById('modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'modal';
                modal.className = 'modal';
            }
            
            const authorArticles = this.allArticles
                .filter(a => a.author === author)
                .slice(0, 5)
                .map(a => `
                    <div class="modal-article">
                        <a class="modal-article-title" href="${a.link}" target="_blank">${a.title}</a>
                        <div class="modal-article-date">📅${a.created.substring(0, 10)}</div>
                    </div>
                `).join('');

            modal.innerHTML = `
                <div class="modal-content">
                    <img class="modal-avatar" src="${avatar}" alt="${author}" data-error-img="${this.errorImg}" onerror="if(!this.retried){this.retried=true;this.src=this.dataset.errorImg}">
                    <a href="${new URL(link).origin}" class="modal-link" target="_blank">${author}</a>
                    <div class="modal-articles">${authorArticles}</div>
                    <img class="modal-background" src="${avatar}" alt="" data-error-img="${this.errorImg}" onerror="if(!this.retried){this.retried=true;this.src=this.dataset.errorImg}">
                </div>
            `;

            modal.onclick = e => {
                if (e.target === modal) {
                    modal.classList.remove('modal-open');
                    modal.addEventListener('transitionend', () => {
                        modal.style.display = 'none';
                        if (modal.parentNode) {
                            modal.parentNode.removeChild(modal);
                        }
                    }, { once: true });
                }
            };

            document.body.appendChild(modal);
            modal.style.display = 'block';
            setTimeout(() => modal.classList.add('modal-open'), 10);
        }

        loadMore() {
            this.displayArticles();
        }

        throttle(func, limit) {
            let inThrottle;
            return function(...args) {
                if (!inThrottle) {
                    func.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            }
        }

        handleImageIntersection(entries, observer) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    observer.unobserve(img);
                }
            });
        }
    }
}

// 将初始化函数也放到全局作用域
if (typeof window.initializeFriendCircleLite === 'undefined') {
    window.initializeFriendCircleLite = (() => {
        let instance = null;
        return () => {
            if (instance) {
                // 清理旧实例
                if (instance.cleanup) {
                    instance.cleanup();
                }
                window.fcInstance = null;
            }
            instance = new window.FriendCircleLite('friend-circle-lite-root');
            return instance;
        };
    })();
}

// 修改初始化逻辑
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initializeFriendCircleLite);
} else {
    window.initializeFriendCircleLite();
}

// PJAX 支持
document.addEventListener('pjax:complete', window.initializeFriendCircleLite);