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
            this.cacheKey = 'fcl_cache';
            this.cacheTimeKey = 'fcl_time';
            this.cacheDuration = config.cache_duration ?? 10 * 60 * 1000; // 默认10分钟

            this.throttledLoadMore = this.throttle(this.loadMore.bind(this), 500);
            this.imageObserver = new IntersectionObserver(this.handleImageIntersection.bind(this));

            this.fishingTimes = parseInt(localStorage.getItem('fcl_fishing_times') || '0');
            this.fishingClicks = parseInt(localStorage.getItem('fcl_fishing_clicks') || '0');
            this.isWorking = false;

            this.fishConfig = {
                defaultFish: 100,
                hungryFish: 100,
                ...UserConfig?.fishing_config
            };

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
            this.handleClick = this.handleClick.bind(this);
            this.root.addEventListener('click', this.handleClick);
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
            try {
                const cached = this.getCache();
                if (cached) return { data: cached, fromCache: true };

                const response = await fetch(`${this.apiUrl}all.json`);
                const data = await response.json();
                
                this.setCache(data);
                return { data, fromCache: false };
            } catch (error) {
                throw new Error('获取文章列表失败');
            }
        }

        getCache() {
            try {
                const cacheTime = localStorage.getItem(this.cacheTimeKey);
                if (!cacheTime) return null;
                
                const now = Date.now();
                if (now - parseInt(cacheTime) >= this.cacheDuration) return null;
                
                const cached = localStorage.getItem(this.cacheKey);
                return cached ? JSON.parse(cached) : null;
            } catch {
                return null;
            }
        }

        setCache(data) {
            try {
                localStorage.setItem(this.cacheKey, JSON.stringify(data));
                localStorage.setItem(this.cacheTimeKey, Date.now().toString());
            } catch (e) {
                console.warn('缓存存储失败:', e);
            }
        }

        async displayArticles(isInitial = false) {
            const start = isInitial ? 0 : this.start;
            const end = start + this.pageSize;
            const articles = this.allArticles.slice(start, end);
            
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

            this.start = end;
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

            if (target.classList.contains('random-title') || 
                target.classList.contains('card-title')) {
                this.fishingClicks++;
                localStorage.setItem('fcl_fishing_clicks', this.fishingClicks.toString());
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

        async updateRandomArticle() {
            if (this.isWorking) return;
            this.isWorking = true;

            // 获取当前等级信息
            const level = this.getFishingLevel();
            const levelInfo = this.fishingTimes >= 5 ? 
                `（Lv.${this.fishingTimes} 当前称号：${level}）` : 
                '';

            // 检查是否饥饿
            const isHungry = this.fishingClicks * this.fishConfig.hungryFish + this.fishConfig.defaultFish < this.fishingTimes 
                && Math.random() < 0.5;
            
            if (isHungry) {
                this.elements.random.innerHTML = `
                    <div class="random-content">
                        因为只钓鱼不吃鱼，过分饥饿导致本次钓鱼失败...${levelInfo}<br>
                        (点击任意一篇钓鱼获得的文章即可恢复）
                    </div>
                `;
                this.isWorking = false;
                return;
            }

            // 显示钓鱼中状态
            this.elements.random.innerHTML = `
                <div class="random-content">
                    钓鱼中... ${levelInfo}
                </div>
            `;

            // 随机延迟
            const delay = this.fishingTimes === 0 ? 0 : Math.floor(Math.random() * 2000) + 1000;
            await new Promise(resolve => setTimeout(resolve, delay));

            const randomArticle = this.allArticles[Math.floor(Math.random() * this.allArticles.length)];
            if (!randomArticle) {
                this.isWorking = false;
                return;
            }

            // 获取随机提示语
            const tips = [
                "钓到了绝世好文！",
                "在河边打了个喷嚏，吓跑了",
                "你和小伙伴抢夺着",
                "你击败了巨龙，在巢穴中发现了",
                "挖掘秦始皇坟时找到了",
                "在路边闲逛的时候随手买了一个",
                "从学校班主任那拿来了孩子上课偷偷看的",
                "你的同桌无情的从你的语文书中撕下了那篇你最喜欢的",
                "考古学家近日发现了",
                "外星人降临地球学习地球文化，落地时被你塞了",
                "从图书馆顶层的隐秘角落里发现了闪着金光的",
                "徒弟修炼走火入魔，为师立刻掏出了",
                "在大山中唱山歌，隔壁的阿妹跑来了，带着",
                "隔壁家的孩子数学考了满分，都是因为看了",
                "隔壁家的孩子英语考了满分，都是因为看了",
                "小米研发了全新一代MIX手机，据说灵感",
                "修炼渡劫成功，还好提前看了",
                "库克坐上了苹果CEO的宝座，因为他面试的时候看了",
                "阿里巴巴大喊芝麻开门，映入眼帘的就是",
                "师傅说练武要先炼心，然后让我好生研读",
                "科考队在南极大陆发现了被冰封的",
                "飞机窗户似乎被一张纸糊上了，仔细一看是",
                "历史上满写的仁义道德四个字，透过字缝里却全是",
                "十几年前的录音机似乎还能够使用，插上电发现正在播的是",
                "新版语文书拟增加一篇熟读并背诵的",
                "经调查，99%的受访者都没有背诵过",
                "今年的高考满分作文是",
                "唐僧揭开了佛祖压在五指山上的",
                "科学家发现能够解决衰老的秘密，就是每日研读",
                "英特尔发布了全新的至强处理器，其芯片的制造原理都是",
                "新的iPhone产能很足，新的进货渠道是",
                "今年亩产突破了八千万斤，多亏了",
                "陆隐一统天上宗，在无数祖境高手的目光下宣读了",
                "黑钻风跟白钻风说道，吃了唐僧肉能长生不老，他知道是因为看了",
                "上卫生间没带纸，直接提裤跑路也不愿意玷污手中",
                "种下一篇文章就会产生很多很多文章，我种下了",
                "三十年河东，三十年河西，莫欺我没有看过",
                "踏破铁血无觅处，得来全靠",
                "今日双色球中了两千万，预测全靠",
                "因为卷子上没写名字，老师罚抄",
                "为了抗议世间的不公，割破手指写下了",
                "在艺术大街上被贴满了相同的纸，走近一看是",
                "这区区迷阵岂能难得住我？其实能走出来多亏了",
                "今日被一篇文章顶上了微博热搜，它是",
                "你送给乞丐一个暴富秘籍，它是",
                "UZI一个走A拿下五杀，在事后采访时说他当时回想起了",
                "科学家解刨了第一个感染丧尸病毒的人，发现丧尸抗体存在于",
                "如果你有梦想的话，就要努力去看",
                "决定我们成为什么样人的，不是我们的能力，而是是否看过",
                "有信心不一定会成功，没信心就去看",
                "你真正是谁并不重要，重要的是你看没看过",
                "玄天境重要的是锻体，为师赠你此书，好好修炼去吧，这是",
                "上百祖境高手在天威湖大战三天三夜为了抢夺",
                "这化仙池水乃上古真仙对后人的考校，要求熟读并背诵",
                "庆氏三千年根基差点竟被你小子毁于一旦，能够被我拯救全是因为我看了",
                "我就是神奇宝贝大师！我这只皮卡丘可是",
                "我就是神奇宝贝大师！我这只小火龙可是",
                "我就是神奇宝贝大师！我这只可达鸭可是",
                "我就是神奇宝贝大师！我这只杰尼龟可是",
                "上古遗迹中写道，只要习得此书，便得成功。你定睛一看，原来是",
                "奶奶的，玩阴的是吧，我就是双料特工代号穿山甲，",
                "你的背景太假了，我的就逼真多了，学到这个技术全是因为看了",
                "我是云南的，云南怒江的，怒江芦水市，芦水市六库，六库傈僳族，傈僳族是",
                "我真的栓Q了，我真的会谢如果你看",
                "你已经习得退退退神功，接下来的心法已经被记录在",
                "人生无常大肠包小肠，小肠包住了",
                "你抽到了普通文章，它是",
                "你收到了稀有文章，它是",
                "你抽到了金色普通文章，它是",
                "你抽到了金色稀有文章，它是",
                "你抽到了传说文章！它是",
                "哇！金色传说！你抽到了金色传说文章，它是",
                "报告！侦察兵说在前往300米有一个男子在偷偷看一本书，上面赫然写着",
                "芷莲姑娘大摆擂台，谁若是能读完此书，便可娶了她。然后从背后掏出了",
                "请问你的梦想是什么？我的梦想是能读到",
                "读什么才能增智慧？当然是读",
                "纳兰嫣然掏出了退婚书，可是发现出门带错了，结果拿出了一本",
                "你要尽全力保护你的梦想。那些嘲笑你的人，他们必定会失败，他们想把你变成和他们一样的人。如果你有梦想的话，就要努力去读",
                "走人生的路就像爬山一样，看起来走了许多冤枉的路，崎岖的路，但终究需要读完",
                "游戏的规则就是这么的简单，你听懂了吗？管你听没听懂，快去看",
            ];
            const randomTip = tips[Math.floor(Math.random() * tips.length)];

            this.elements.random.innerHTML = `
                <div class="random-content">
                    ${randomTip}
                    <span class="random-author" data-author="${randomArticle.author}" 
                        data-avatar="${randomArticle.avatar}" 
                        data-link="${randomArticle.link}">${randomArticle.author}</span>
                    的
                    <span class="random-title" data-link="${randomArticle.link}">${randomArticle.title}</span>
                </div>
            `;

            // 更新钓鱼次数
            this.fishingTimes++;
            localStorage.setItem('fcl_fishing_times', this.fishingTimes.toString());
            
            this.isWorking = false;
        }

        getFishingLevel() {
            const times = this.fishingTimes;
            if (times > 10000) return "愿者上钩";
            if (times > 1000) return "俯览天下";
            if (times > 100) return "绝世渔夫";
            if (times > 75) return "钓鱼王者";
            if (times > 50) return "钓鱼宗师";
            if (times > 20) return "钓鱼专家";
            if (times > 5) return "钓鱼高手";
            return "钓鱼新手";
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

        cleanup() {
            // 清理事件监听
            this.root?.removeEventListener('click', this.handleClick);
            // 清理 IntersectionObserver
            this.imageObserver?.disconnect();
            // 重置变量
            this.start = 0;
            this.allArticles = [];
        }
    }
}

// 将初始化函数也放到全局作用域
if (typeof window.initializeFriendCircleLite === 'undefined') {
    window.initializeFriendCircleLite = (() => {
        let instance = null;
        return () => {
            if (instance) {
                instance.cleanup();
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