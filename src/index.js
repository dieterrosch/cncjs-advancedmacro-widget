import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import XHR from 'i18next-xhr-backend';
import qs from 'qs';
import 'regenerator-runtime/runtime';
import semver from 'semver';
import settings from './config/settings';
import controller from './lib/controller';
import log from './lib/log';
import series from './lib/promise-series';
import promisify from './lib/promisify';
import ResizeObserver from './lib/ResizeObserver';
import './styles/app.styl';
import './styles/vendor.styl';

// Query Parameters
// * token (required): An authentication token to enable secure communication.
// * host (optional): Specifies the host to connect to. Defaults to an empty string.
// * widget (optional): Specifies a folder name under 'src/widgets'. Defaults to 'ReactApp'.
const params = qs.parse(window.location.search.slice(1));
series([
    () => promisify(next => {
        i18next
            .use(XHR)
            .use(LanguageDetector)
            .init(settings.i18next, (t) => {
                next();
            });
    })()
// eslint-disable-next-line require-await
]).then(async () => {
    window.addEventListener('message', (event) => {
        const { token, version, action } = { ...event.data };

        // Token authentication
        if (token !== params.token) {
            if (process.env.NODE_ENV === 'production') {
                log.warn(`Received a message with an unauthorized token (${token}).`);
            }
            return;
        }

        if (version && semver.satisfies(version, '<1.9.10 || >=2.0.0')) {
            const el = document.getElementById('viewport');
            el.innerHTML = `
            <div style="padding: 10px">
                This widget is not compatible with CNCjs ${version}
            </div>
        `.trim();
            return;
        }

        const { type, payload } = { ...action };
        if (type === 'change') {
            // Do not close the port if the port parameter is empty
            const { port } = { ...payload };
            port && controller.openPort(port);
        }
    });

    // Dynamic imports
    const widget = params.widget || 'AdvancedMacro';
    import(`./widgets/${widget}`)
        .then(m => {
            const { default: render } = m;

            if (typeof render !== 'function') {
                log.error(`Expected a function but got ${render}. Check the default export in "widgets/${widget}".`);
                return undefined;
            }

            return render();
        })
        .then(() => {
            if (!params.token) {
                return;
            }

            // Connect to a socket.io server
            const host = params.host || ''; // e.g. http://localhost:8000
            const options = {
                query: 'token=' + params.token
            };
            controller.connect(host, options, () => {
                // Use the postMessage API for inter-frame communication
                window.parent.postMessage({
                    token: params.token,
                    action: {
                        type: 'connect'
                    }
                }, '*');
            });

            new ResizeObserver(() => {
                // Use the postMessage API for inter-frame communication
                window.parent.postMessage({
                    token: params.token,
                    action: {
                        type: 'resize',
                        payload: {
                            clientHeight: document.body.clientHeight,
                            clientWidth: document.body.clientWidth,
                            offsetHeight: document.body.offsetHeight,
                            offsetWidth: document.body.offsetWidth,
                            scrollHeight: 700, //document.body.scrollHeight,
                            scrollWidth: document.body.scrollWidth
                        }
                    }
                }, '*');
            }).observe(document.body);
        })
        .catch(err => {
            log.error(err);
        });
});
