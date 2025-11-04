#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const MOSKIT_API_BASE = "https://api.moskitcrm.com/v2";

interface MoskitConfig {
  apiKey: string;
}

interface SearchCondition {
  field: string;
  expression: string;
  values: any[];
}

class MoskitServer {
  private server: Server;
  private config: MoskitConfig;

  constructor() {
    this.config = {
      apiKey: process.env.MOSKIT_API_KEY || "",
    };

    this.server = new Server(
      {
        name: "moskit-crm",
        version: "2.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private getHeaders() {
    return {
      apikey: this.config.apiKey,
      "Content-Type": "application/json",
    };
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // ===== USERS =====
        {
          name: "list_users",
          description: "Lista usuários do Moskit CRM",
          inputSchema: {
            type: "object",
            properties: {
              start: { type: "number", description: "Registro inicial (0-10000)" },
              quantity: { type: "number", description: "Quantidade (1-50)" },
              sort: { type: "string", description: "Campo para ordenar" },
              order: { type: "string", description: "ASC ou DESC" },
              nextPageToken: { type: "string", description: "Token para a próxima página" },
            },
          },
        },

        // ===== CONTACTS - LISTAGEM SIMPLES =====
        {
          name: "list_contacts",
          description: "Lista contatos com paginação simples (sem filtros)",
          inputSchema: {
            type: "object",
            properties: {
              start: { type: "number", description: "Registro inicial (0-10000)" },
              quantity: { type: "number", description: "Quantidade (1-50, padrão 10)" },
              sort: { type: "string", description: "Campo para ordenar (ex: dateCreated, name)" },
              order: { type: "string", description: "ASC ou DESC" },
              nextPageToken: { type: "string", description: "Token para a próxima página" },
            },
          },
        },

        // ===== CONTACTS - BUSCA AVANÇADA =====
        {
          name: "search_contacts",
          description: "Busca avançada de contatos com filtros complexos (por data, nome, email, etc)",
          inputSchema: {
            type: "object",
            properties: {
              conditions: {
                type: "array",
                description: "Array de condições de busca",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string", description: "Campo (ex: dateCreated, name, emails)" },
                    expression: { type: "string", description: "Expressão (ex: gte, lte, like, one_of)" },
                    values: { type: "array", description: "Valores para a condição" },
                  },
                  required: ["field", "expression", "values"],
                },
              },
              start: { type: "number", description: "Registro inicial" },
              quantity: { type: "number", description: "Quantidade de resultados" },
              sort: { type: "string", description: "Campo para ordenar" },
              order: { type: "string", description: "ASC ou DESC" },
              nextPageToken: { type: "string", description: "Token para a próxima página" },
            },
            required: ["conditions"],
          },
        },

        {
          name: "get_contact_search_fields",
          description: "Lista campos disponíveis para busca de contatos (útil para saber quais filtros usar)",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },

        {
          name: "get_contact",
          description: "Obtém detalhes de um contato específico",
          inputSchema: {
            type: "object",
            properties: {
              contact_id: { type: "string", description: "ID do contato" },
            },
            required: ["contact_id"],
          },
        },

        {
          name: "create_contact",
          description: "Cria um novo contato",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nome do contato (obrigatório)" },
              cpf: { type: "string", description: "CPF" },
              notes: { type: "string", description: "Observações" },
              emails: {
                type: "array",
                description: "Lista de emails",
                items: {
                  type: "object",
                  properties: {
                    address: { type: "string" },
                    type: { type: "string", description: "PERSONAL, WORK, OTHER" },
                  },
                },
              },
              phones: {
                type: "array",
                description: "Lista de telefones",
                items: {
                  type: "object",
                  properties: {
                    number: { type: "string" },
                    type: { type: "string", description: "MOBILE, HOME, WORK, OTHER" },
                  },
                },
              },
              responsible: {
                type: "object",
                description: "Responsável pelo contato",
                properties: {
                  id: { type: "number", description: "ID do usuário responsável" },
                },
              },
            },
            required: ["name"],
          },
        },

        {
          name: "update_contact",
          description: "Atualiza um contato existente",
          inputSchema: {
            type: "object",
            properties: {
              contact_id: { type: "string", description: "ID do contato" },
              name: { type: "string" },
              cpf: { type: "string" },
              notes: { type: "string" },
              emails: { type: "array" },
              phones: { type: "array" },
            },
            required: ["contact_id"],
          },
        },

        {
          name: "delete_contact",
          description: "Remove um contato",
          inputSchema: {
            type: "object",
            properties: {
              contact_id: { type: "string", description: "ID do contato" },
            },
            required: ["contact_id"],
          },
        },

        // ===== DEALS - LISTAGEM SIMPLES =====
        {
          name: "list_deals",
          description: "Lista negociações com paginação simples (sem filtros)",
          inputSchema: {
            type: "object",
            properties: {
              start: { type: "number" },
              quantity: { type: "number" },
              sort: { type: "string", description: "Campo para ordenar" },
              order: { type: "string", description: "ASC ou DESC" },
              nextPageToken: { type: "string", description: "Token para a próxima página" },
            },
          },
        },

        // ===== DEALS - BUSCA AVANÇADA =====
        {
          name: "search_deals",
          description: "Busca avançada de negociações com filtros (status, valor, data, etc)",
          inputSchema: {
            type: "object",
            properties: {
              conditions: {
                type: "array",
                description: "Array de condições de busca",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string", description: "Campo (ex: status, value, dateCreated)" },
                    expression: { type: "string", description: "Expressão (ex: one_of, gte, lte)" },
                    values: { type: "array", description: "Valores" },
                  },
                },
              },
              start: { type: "number" },
              quantity: { type: "number" },
              sort: { type: "string" },
              order: { type: "string" },
              nextPageToken: { type: "string", description: "Token para a próxima página" },
            },
            required: ["conditions"],
          },
        },

        {
          name: "get_deal_search_fields",
          description: "Lista campos disponíveis para busca de negociações",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },

        {
          name: "get_deal",
          description: "Obtém detalhes de uma negociação",
          inputSchema: {
            type: "object",
            properties: {
              deal_id: { type: "string" },
            },
            required: ["deal_id"],
          },
        },

        {
          name: "create_deal",
          description: "Cria uma nova negociação",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string", description: "Título da negociação" },
              value: { type: "number", description: "Valor" },
              contacts: {
                type: "array",
                description: "Contatos relacionados",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "number", description: "ID do contato" },
                  },
                },
              },
              stage: {
                type: "object",
                description: "Estágio do funil",
                properties: {
                  id: { type: "number", description: "ID do estágio" },
                },
              },
            },
            required: ["title"],
          },
        },

        {
          name: "update_deal",
          description: "Atualiza uma negociação",
          inputSchema: {
            type: "object",
            properties: {
              deal_id: { type: "string" },
              title: { type: "string" },
              value: { type: "number" },
              status: { type: "string", description: "OPEN, WON, LOST" },
            },
            required: ["deal_id"],
          },
        },

        {
          name: "delete_deal",
          description: "Remove uma negociação",
          inputSchema: {
            type: "object",
            properties: {
              deal_id: { type: "string" },
            },
            required: ["deal_id"],
          },
        },

        // ===== ACTIVITIES =====
        {
          name: "list_activities",
          description: "Lista atividades com paginação simples",
          inputSchema: {
            type: "object",
            properties: {
              start: { type: "number" },
              quantity: { type: "number" },
              sort: { type: "string" },
              order: { type: "string" },
              nextPageToken: { type: "string", description: "Token para a próxima página" },
            },
          },
        },

        {
          name: "search_activities",
          description: "Busca avançada de atividades com filtros",
          inputSchema: {
            type: "object",
            properties: {
              conditions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string" },
                    expression: { type: "string" },
                    values: { type: "array" },
                  },
                },
              },
              start: { type: "number" },
              quantity: { type: "number" },
              nextPageToken: { type: "string", description: "Token para a próxima página" },
            },
            required: ["conditions"],
          },
        },

        {
          name: "get_activity_search_fields",
          description: "Lista campos disponíveis para busca de atividades",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },

        {
          name: "create_activity",
          description: "Cria uma atividade",
          inputSchema: {
            type: "object",
            properties: {
              type: { type: "string", description: "Tipo de atividade" },
              title: { type: "string", description: "Título" },
              description: { type: "string", description: "Descrição" },
              dueDate: { type: "string", description: "Data/hora no formato ISO 8601" },
            },
            required: ["type", "title"],
          },
        },

        // ===== FUNNELS & STAGES =====
        {
          name: "list_funnels",
          description: "Lista funis de vendas",
          inputSchema: {
            type: "object",
            properties: {
              start: { type: "number" },
              quantity: { type: "number" },
              sort: { type: "string" },
              order: { type: "string" },
              nextPageToken: { type: "string", description: "Token para a próxima página" },
            },
          },
        },

        {
          name: "list_stages",
          description: "Lista estágios de um funil",
          inputSchema: {
            type: "object",
            properties: {
              start: { type: "number" },
              quantity: { type: "number" },
              sort: { type: "string" },
              order: { type: "string" },
              nextPageToken: { type: "string", description: "Token para a próxima página" },
            },
          },
        },

        // ===== TEAMS =====
        {
          name: "list_teams",
          description: "Lista equipes",
          inputSchema: {
            type: "object",
            properties: {
              start: { type: "number" },
              quantity: { type: "number" },
              nextPageToken: { type: "string", description: "Token para a próxima página" },
            },
          },
        },

        // ===== PRODUCTS =====
        {
          name: "list_products",
          description: "Lista produtos",
          inputSchema: {
            type: "object",
            properties: {
              start: { type: "number" },
              quantity: { type: "number" },
              nextPageToken: { type: "string", description: "Token para a próxima página" },
            },
          },
        },

        {
          name: "create_product",
          description: "Cria um produto",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              price: { type: "number" },
            },
            required: ["name"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        // Users
        if (name === "list_users") return await this.listUsers(args || {});

        // Contacts
        if (name === "list_contacts") return await this.listContacts(args || {});
        if (name === "search_contacts") return await this.searchContacts(args || {});
        if (name === "get_contact_search_fields") return await this.getSearchFields("contacts");
        if (name === "get_contact") return await this.getContact((args as any)?.contact_id);
        if (name === "create_contact") return await this.createContact(args || {});
        if (name === "update_contact") return await this.updateContact(args || {});
        if (name === "delete_contact") return await this.deleteContact((args as any)?.contact_id);

        // Deals
        if (name === "list_deals") return await this.listDeals(args || {});
        if (name === "search_deals") return await this.searchDeals(args || {});
        if (name === "get_deal_search_fields") return await this.getSearchFields("deals");
        if (name === "get_deal") return await this.getDeal((args as any)?.deal_id);
        if (name === "create_deal") return await this.createDeal(args || {});
        if (name === "update_deal") return await this.updateDeal(args || {});
        if (name === "delete_deal") return await this.deleteDeal((args as any)?.deal_id);

        // Activities
        if (name === "list_activities") return await this.listActivities(args || {});
        if (name === "search_activities") return await this.searchActivities(args || {});
        if (name === "get_activity_search_fields") return await this.getSearchFields("activities");
        if (name === "create_activity") return await this.createActivity(args || {});

        // Funnels & Stages
        if (name === "list_funnels") return await this.listFunnels(args || {});
        if (name === "list_stages") return await this.listStages(args || {});

        // Teams
        if (name === "list_teams") return await this.listTeams(args || {});

        // Products
        if (name === "list_products") return await this.listProducts(args || {});
        if (name === "create_product") return await this.createProduct(args || {});

        throw new Error(`Ferramenta desconhecida: ${name}`);
      } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
        return {
          content: [{ type: "text", text: `Erro: ${errorMsg}` }],
          isError: true,
        };
      }
    });
  }

  private buildQueryString(params: any): string {
    const query = new URLSearchParams();
    if (params.start !== undefined) query.append("start", String(params.start));
    if (params.quantity !== undefined) query.append("quantity", String(params.quantity));
    if (params.sort) query.append("sort", params.sort);
    if (params.order) query.append("order", params.order);
    if (params.nextPageToken) query.append("nextPageToken", params.nextPageToken);
    const qs = query.toString();
    return qs ? `?${qs}` : "";
  }

  // ===== GENERIC SEARCH =====
  private async genericSearch(entity: string, args: any) {
    const { conditions, start, quantity, sort, order } = args;
    const queryString = this.buildQueryString({ start, quantity, sort, order });
    
    const response = await axios.post(
      `${MOSKIT_API_BASE}/${entity}/search${queryString}`,
      conditions || [],
      { headers: this.getHeaders() }
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total: response.headers['x-moskit-listing-total'],
          present: response.headers['x-moskit-listing-present'],
          data: response.data
        }, null, 2)
      }]
    };
  }

  private async getSearchFields(entity: string) {
    const response = await axios.get(`${MOSKIT_API_BASE}/${entity}/search`, {
      headers: this.getHeaders(),
    });
    return {
      content: [{
        type: "text",
        text: `Campos disponíveis para busca em ${entity}:\n\n${JSON.stringify(response.data, null, 2)}`
      }]
    };
  }

  // ===== USERS =====
  private async listUsers(args: any) {
    const qs = this.buildQueryString(args);
    const response = await axios.get(`${MOSKIT_API_BASE}/users${qs}`, {
      headers: this.getHeaders(),
    });
    return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
  }

  // ===== CONTACTS =====
  private async listContacts(args: any) {
    const qs = this.buildQueryString(args);
    const response = await axios.get(`${MOSKIT_API_BASE}/contacts${qs}`, {
      headers: this.getHeaders(),
    });
    return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
  }

  private async searchContacts(args: any) {
    return await this.genericSearch("contacts", args);
  }

  private async getContact(contactId: string) {
    const response = await axios.get(`${MOSKIT_API_BASE}/contacts/${contactId}`, {
      headers: this.getHeaders(),
    });
    return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
  }

  private async createContact(data: any) {
    const response = await axios.post(`${MOSKIT_API_BASE}/contacts`, data, {
      headers: {
        ...this.getHeaders(),
        "X-Moskit-Origin": "GEMINI_MCP",
      },
    });
    return { content: [{ type: "text", text: `Contato criado!\n${JSON.stringify(response.data, null, 2)}` }] };
  }

  private async updateContact(data: any) {
    const { contact_id, ...updateData } = data;
    const response = await axios.put(`${MOSKIT_API_BASE}/contacts/${contact_id}`, updateData, {
      headers: {
        ...this.getHeaders(),
        "X-Moskit-Origin": "GEMINI_MCP",
      },
    });
    return { content: [{ type: "text", text: `Contato atualizado!\n${JSON.stringify(response.data, null, 2)}` }] };
  }

  private async deleteContact(contactId: string) {
    await axios.delete(`${MOSKIT_API_BASE}/contacts/${contactId}`, {
      headers: this.getHeaders(),
    });
    return { content: [{ type: "text", text: `Contato ${contactId} removido!` }] };
  }

  // ===== DEALS =====
  private async listDeals(args: any) {
    const qs = this.buildQueryString(args);
    const response = await axios.get(`${MOSKIT_API_BASE}/deals${qs}`, {
      headers: this.getHeaders(),
    });
    return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
  }

  private async searchDeals(args: any) {
    return await this.genericSearch("deals", args);
  }

  private async getDeal(dealId: string) {
    const response = await axios.get(`${MOSKIT_API_BASE}/deals/${dealId}`, {
      headers: this.getHeaders(),
    });
    return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
  }

  private async createDeal(data: any) {
    const response = await axios.post(`${MOSKIT_API_BASE}/deals`, data, {
      headers: {
        ...this.getHeaders(),
        "X-Moskit-Origin": "GEMINI_MCP",
      },
    });
    return { content: [{ type: "text", text: `Negociação criada!\n${JSON.stringify(response.data, null, 2)}` }] };
  }

  private async updateDeal(data: any) {
    const { deal_id, ...updateData } = data;
    const response = await axios.put(`${MOSKIT_API_BASE}/deals/${deal_id}`, updateData, {
      headers: {
        ...this.getHeaders(),
        "X-Moskit-Origin": "GEMINI_MCP",
      },
    });
    return { content: [{ type: "text", text: `Negociação atualizada!\n${JSON.stringify(response.data, null, 2)}` }] };
  }

  private async deleteDeal(dealId: string) {
    await axios.delete(`${MOSKIT_API_BASE}/deals/${dealId}`, {
      headers: this.getHeaders(),
    });
    return { content: [{ type: "text", text: `Negociação ${dealId} removida!` }] };
  }

  // ===== ACTIVITIES =====
  private async listActivities(args: any) {
    const qs = this.buildQueryString(args);
    const response = await axios.get(`${MOSKIT_API_BASE}/activities${qs}`, {
      headers: this.getHeaders(),
    });
    return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
  }

  private async searchActivities(args: any) {
    return await this.genericSearch("activities", args);
  }

  private async createActivity(data: any) {
    const response = await axios.post(`${MOSKIT_API_BASE}/activities`, data, {
      headers: {
        ...this.getHeaders(),
        "X-Moskit-Origin": "GEMINI_MCP",
      },
    });
    return { content: [{ type: "text", text: `Atividade criada!\n${JSON.stringify(response.data, null, 2)}` }] };
  }

  // ===== FUNNELS & STAGES =====
  private async listFunnels(args: any) {
    const qs = this.buildQueryString(args);
    const response = await axios.get(`${MOSKIT_API_BASE}/pipelines${qs}`, {
      headers: this.getHeaders(),
    });
    return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
  }

  private async listStages(args: any) {
    const qs = this.buildQueryString(args);
    const response = await axios.get(`${MOSKIT_API_BASE}/stages${qs}`, {
      headers: this.getHeaders(),
    });
    return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
  }

  // ===== TEAMS =====
  private async listTeams(args: any) {
    const qs = this.buildQueryString(args);
    const response = await axios.get(`${MOSKIT_API_BASE}/teams${qs}`, {
      headers: this.getHeaders(),
    });
    return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
  }

  // ===== PRODUCTS =====
  private async listProducts(args: any) {
    const qs = this.buildQueryString(args);
    const response = await axios.get(`${MOSKIT_API_BASE}/products${qs}`, {
      headers: this.getHeaders(),
    });
    return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
  }

  private async createProduct(data: any) {
    const response = await axios.post(`${MOSKIT_API_BASE}/products`, data, {
      headers: this.getHeaders(),
    });
    return { content: [{ type: "text", text: `Produto criado!\n${JSON.stringify(response.data, null, 2)}` }] };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Moskit CRM MCP Server v2.0 (API V2 corrigida) rodando");
  }
}

const server = new MoskitServer();
server.run().catch(console.error);