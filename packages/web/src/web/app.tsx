import { Redirect, Route, Switch } from "wouter";
import { AgentFeedback } from "@runablehq/website-runtime";
import { Provider } from "./components/provider";
import { CartProvider } from "./lib/cart";
import { Layout } from "./components/layout";
import Index from "./pages/index";
import Loja from "./pages/loja";
import Produto from "./pages/produto";
import Sobre from "./pages/sobre";
import Clube from "./pages/clube";
import Conheca from "./pages/conheca";
import Contato from "./pages/contato";
import Carrinho from "./pages/carrinho";
import Checkout from "./pages/checkout";
import Pedido from "./pages/pedido";
import NaoEncontrado from "./pages/nao-encontrado";
import Gestao from "./pages/gestao";
import NewsletterCancelar from "./pages/newsletter-cancelar";

function App() {
  return (
    <Provider>
      <CartProvider>
        {/* Painel de gestão fica fora do Layout: sem header, menu nem carrinho. */}
        <Switch>
          <Route path="/gestao" component={Gestao} />
          <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Index} />
            <Route path="/loja" component={Loja} />
            <Route path="/cafe/:slug" component={Produto} />
            <Route path="/sobre" component={Sobre} />
            <Route path="/clube" component={Clube} />
            <Route path="/conheca-seu-cafe" component={Conheca} />
            {/* rotas antigas do Diário — mantidas como redirect pra não perder link */}
            <Route path="/diario">{() => <Redirect to="/conheca-seu-cafe" replace />}</Route>
            <Route path="/diario/:slug">{() => <Redirect to="/conheca-seu-cafe" replace />}</Route>
            <Route path="/contato" component={Contato} />
            <Route path="/carrinho" component={Carrinho} />
            <Route path="/checkout" component={Checkout} />
            <Route path="/pedido/:reference" component={Pedido} />
            <Route path="/newsletter/cancelar" component={NewsletterCancelar} />
            <Route component={NaoEncontrado} />
          </Switch>
        </Layout>
          </Route>
        </Switch>
      </CartProvider>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
    </Provider>
  );
}

export default App;
